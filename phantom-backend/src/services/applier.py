from pathlib import Path
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from src.models.schemas import ApplyStepRequest, ApplyStepResponse
from src.core.config import settings
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

def print_application_receipt(url: str, title: str, answers: dict, fields: list, next_action_id: str = None, page_type: str = None, reasoning: str = None, upload_resume: bool = False, upload_field_id: str = None):
    fields_map = {f.phantom_id: f for f in fields}

    extracted_table = Table(title="Extracted Fields", show_header=True, header_style="bold cyan")
    extracted_table.add_column("Field ID", style="dim", width=20)
    extracted_table.add_column("Label / Placeholder", width=40)
    extracted_table.add_column("Type", width=12)
    extracted_table.add_column("Required", width=8)
    extracted_table.add_column("Options", width=30)

    for field in fields:
        label = "[inferred from HTML]" if field.label == "__needs_inference__" else (
            field.label or field.placeholder or field.name or "Unknown"
        )
        options = ", ".join(field.options or [])
        if field.phantom_id == next_action_id:
            label = f"{label} [SELECTED ACTION]"
        extracted_table.add_row(
            field.phantom_id,
            label,
            field.type,
            "yes" if field.required else "no",
            options
        )

    answers_table = Table(title="Generated Answers", show_header=True, header_style="bold magenta")
    answers_table.add_column("Field ID", style="dim", width=20)
    answers_table.add_column("Label / Placeholder", width=40)
    answers_table.add_column("Type", width=12)
    answers_table.add_column("Answer", style="green")

    for f_id, ans in answers.items():
        field = fields_map.get(f_id)
        label = field.label or field.placeholder or field.name or "Unknown" if field else "Unknown"
        f_type = field.type if field else "Unknown"
        answers_table.add_row(f_id, label, f_type, str(ans))

    if not answers:
        answers_table.add_row("-", "No input answers returned", "-", "-")

    console.print()
    console.print(
        Panel(
            f"URL: [link={url}]{url}[/link] | Page: {title}",
            title=f"[bold green]Phantom Auto-Apply Step ({page_type or 'Unknown'})[/bold green]",
            expand=False
        )
    )
    console.print(extracted_table)
    console.print(answers_table)
    if reasoning:
        console.print(f"[cyan]Reasoning:[/cyan] {reasoning}")
    if upload_resume and upload_field_id:
        console.print(f"[magenta]File Upload:[/magenta] Injecting resume.pdf into element {upload_field_id}")
    console.print(f"[cyan]Next Action ID:[/cyan] {next_action_id or 'None'}")
    console.print()

def generate_answers_for_step(request: ApplyStepRequest) -> ApplyStepResponse:
    """
    Takes a step request containing extracted form fields and returns answers
    drafted using the LLM based on the user's resume.
    """
    # Load resume
    resume_path = Path(__file__).parent.parent.parent / "resume.txt"
    try:
        resume_text = resume_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        print("resume.txt not found! Using empty string.")
        resume_text = ""

    llm = ChatGoogleGenerativeAI(
        model="gemini-2.5-flash",
        api_key=settings.GEMINI_API_KEY,
        temperature=0, # Low temperature for accurate field matching
    )
    
    structured_llm = llm.with_structured_output(ApplyStepResponse)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an AI assistant helping a user apply to jobs. Your task is to fill out job application forms automatically and navigate to the next step.\n\n"
                   "USER RESUME:\n{resume}\n\n"
                   "INSTRUCTIONS:\n"
                   "1. You will receive a JSON list of form fields and actionable buttons/links extracted from the current page.\n"
                   "2. Identify the `page_type` (e.g. 'form' for input pages, 'review' for reviewing data, 'success' for completion, or 'unknown').\n"
                   "3. Provide `reasoning` for your choices.\n"
                   "4. Some fields will have `label` set to `__needs_inference__` and an `html_snippet` field containing the raw HTML of that element. "
                   "For these fields, infer the true question label from the HTML before generating an answer. Do not return `__needs_inference__` as an answer.\n"
                   "5. For each input field, provide the best answer based on the resume. Return a dictionary mapping the field's `phantom_id` to the corresponding answer in `answers`.\n"
                   "6. For radio buttons or dropdowns, ensure your answer matches one of the provided `options`. Radio options may be represented as separate fields that share the same options list; choose the single `phantom_id` that corresponds to the desired option and return only that selected option.\n"
                   "7. Provide polite placeholders for required unknown questions (e.g., '0' for salary, or 'Will discuss during interview').\n"
                   "8. If there is a file upload field specifically requesting a Resume/CV, set `upload_resume` to true and provide the field's `phantom_id` in `upload_field_id`. Do NOT do this for cover letters or other documents.\n"
                   "9. Identify the most appropriate button or link to click to proceed to the next step, and return its `phantom_id` in `next_action_id`. Examples of proceed buttons: 'Next', 'Continue', 'Submit', 'Apply'. Do not select 'Back' or 'Cancel'.\n"
                   "10. Output EXACTLY the `ApplyStepResponse` schema."),
        ("user", "PAGE TITLE: {page_title}\n\nFORM FIELDS AND ACTIONS:\n{fields}")
    ])
    
    chain = prompt | structured_llm
    
    fields_dump = [field.model_dump() for field in request.fields]
    console.print(f"[cyan]Sending {len(fields_dump)} extracted fields to LLM[/cyan]")
    
    response = chain.invoke({
        "resume": resume_text,
        "page_title": request.page_title or "Unknown",
        "fields": fields_dump
    })

    # Log any fields that required HTML label inference
    inferred = [f for f in request.fields if f.label == "__needs_inference__"]
    if inferred:
        console.print(f"[yellow]⚠ {len(inferred)} field(s) required HTML label inference:[/yellow]")
        for f in inferred:
            console.print(f"  [dim]{f.phantom_id}[/dim] → snippet: {(f.html_snippet or '')[:80]}...")
    
    try:
        url = request.page_url or "Unknown URL"
        title = request.page_title or "Unknown Page"
        print_application_receipt(
            url, title, response.answers, request.fields, 
            next_action_id=response.next_action_id, 
            page_type=response.page_type,
            reasoning=response.reasoning,
            upload_resume=response.upload_resume,
            upload_field_id=response.upload_field_id
        )
    except Exception as e:
        console.print(f"[red]Error printing apply-step receipt: {e}[/red]")
    
    return response
