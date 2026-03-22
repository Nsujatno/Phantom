from pathlib import Path
from datetime import datetime, timezone
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from src.models.schemas import ApplyStepRequest, ApplyStepResponse
from src.core.config import settings
from src.services.notion_service import NotionService
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

console = Console()

def print_application_receipt(url: str, title: str, answers: dict, fields: list, next_action_id: str = None, page_type: str = None, reasoning: str = None):
    table = Table(title="Generated Answers", show_header=True, header_style="bold magenta")
    table.add_column("Field ID", style="dim", width=20)
    table.add_column("Label / Placeholder", width=30)
    table.add_column("Type", width=10)
    table.add_column("Answer", style="green")

    fields_map = {f.phantom_id: f for f in fields}

    for f_id, ans in answers.items():
        field = fields_map.get(f_id)
        label = field.label or field.placeholder or field.name or "Unknown" if field else "Unknown"
        f_type = field.type if field else "Unknown"
        table.add_row(f_id, label, f_type, str(ans))

    panel = Panel(
        table,
        title=f"[bold green]Phantom Auto-Apply Step ({page_type or 'Unknown'})[/bold green]",
        subtitle=f"URL: [link={url}]{url}[/link] | Page: {title}",
        expand=False
    )
    console.print()
    console.print(panel)
    if reasoning:
        console.print(f"[cyan]Reasoning:[/cyan] {reasoning}")
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
                   "4. For each input field, provide the best answer based on the resume. Return a dictionary mapping the field's `phantom_id` to the corresponding answer in `answers`.\n"
                   "5. For radio buttons or dropdowns, ensure your answer matches one of the provided `options`.\n"
                   "6. Provide polite placeholders for required unknown questions (e.g., '0' for salary, or 'Will discuss during interview').\n"
                   "7. Identify the most appropriate button or link to click to proceed to the next step, and return its `phantom_id` in `next_action_id`. Examples of proceed buttons: 'Next', 'Continue', 'Submit', 'Apply'. Do not select 'Back' or 'Cancel'.\n"
                   "8. Output EXACTLY the `ApplyStepResponse` schema."),
        ("user", "PAGE TITLE: {page_title}\n\nFORM FIELDS AND ACTIONS:\n{fields}")
    ])
    
    chain = prompt | structured_llm
    
    fields_dump = [field.model_dump() for field in request.fields]
    
    response = chain.invoke({
        "resume": resume_text,
        "page_title": request.page_title or "Unknown",
        "fields": fields_dump
    })
    
    try:
        url = request.page_url or "Unknown URL"
        title = request.page_title or "Unknown Page"
        print_application_receipt(
            url, title, response.answers, request.fields, 
            next_action_id=response.next_action_id, 
            page_type=response.page_type,
            reasoning=response.reasoning
        )
        
        if response.page_type == "success":
            notion = NotionService()
            job_dict = {
                "title": title,
                "company": "Application Auto-Fill",
                "url": url
            }
            notion.log_job(
                job=job_dict,
                status="Applied",
                date_applied=datetime.now(timezone.utc)
            )
    except Exception as e:
        console.print(f"[red]Error printing receipt or logging to Notion: {e}[/red]")
    
    return response

