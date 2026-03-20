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

def print_application_receipt(url: str, title: str, answers: dict, fields: list):
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
        title=f"[bold green]Phantom Auto-Apply Started[/bold green]",
        subtitle=f"URL: [link={url}]{url}[/link] | Page: {title}",
        expand=False
    )
    console.print()
    console.print(panel)
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
        model="gemini-2.5-flash-lite",
        api_key=settings.GEMINI_API_KEY,
        temperature=0, # Low temperature for accurate field matching
    )
    
    structured_llm = llm.with_structured_output(ApplyStepResponse)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an AI assistant helping a user apply to jobs. Your task is to fill out job application forms automatically.\n\n"
                   "USER RESUME:\n{resume}\n\n"
                   "INSTRUCTIONS:\n"
                   "1. You will be provided with a JSON list of form fields extracted from the current page of the application.\n"
                   "2. For each field, provide the best answer based on the user's resume.\n"
                   "3. Return a dictionary mapping the field's `phantom_id` to the corresponding answer.\n"
                   "4. For radio buttons or dropdowns, make sure your answer matches one of the provided `options`.\n"
                   "5. If you do not know the answer to a required question, provide a polite, reasonable placeholder (e.g. '0' for salary, or 'Will discuss during interview').\n"
                   "6. Output EXACTLY the `ApplyStepResponse` schema, which contains a dictionary mapping the `phantom_id` string to the answer string/bool/list."),
        ("user", "PAGE TITLE: {page_title}\n\nFORM FIELDS:\n{fields}")
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
        print_application_receipt(url, title, response.answers, request.fields)
        
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

