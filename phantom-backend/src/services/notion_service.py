from datetime import datetime, timezone
from notion_client import Client
from src.core.config import settings
from src.models.schemas import JobScore, DraftedAnswer


class NotionService:
    """Handles all interactions with the Notion API."""

    def __init__(self):
        self.client = Client(auth=settings.NOTION_API_KEY, notion_version="2022-06-28")
        self.database_id = settings.NOTION_DATABASE_ID

    def log_job(
        self,
        job: dict,
        status: str,
        score: JobScore | None = None,
        drafted_answers: list[DraftedAnswer] | None = None,
        date_found: datetime | None = None,
        date_applied: datetime | None = None,
    ) -> str | None:
        """
        Creates or updates a job entry in the Notion database.
        Deduplicates by URL — if a page with the same URL exists, it updates it.
        Returns the page ID on success, None on failure.
        """
        title = job.get("title", "Unknown Role")
        company = job.get("company", "Unknown Company")
        url = job.get("url", "")

        try:
            existing_page_id = self.find_page_by_url(url)

            properties = self._build_properties(
                title, company, url, status, score, drafted_answers, date_found, date_applied
            )

            if existing_page_id:
                self.client.pages.update(
                    page_id=existing_page_id,
                    properties=properties,
                )
                print(f"[NOTION] Updated: {title} @ {company} -> {status}")
                return existing_page_id
            else:
                new_page = self.client.pages.create(
                    parent={"database_id": self.database_id},
                    properties=properties,
                )
                page_id = new_page["id"]
                print(f"[NOTION] Logged: {title} @ {company} -> {status}")
                return page_id

        except Exception as e:
            print(f"[NOTION ERROR] Failed to log {title} @ {company}: {e}")
            return None

    def find_page_by_url(self, url: str) -> str | None:
        """Queries the database for an existing page with a matching URL."""
        if not url:
            return None
        try:
            results = self.client.request(
                path=f"databases/{self.database_id}/query",
                method="POST",
                body={
                    "filter": {
                        "property": "URL",
                        "url": {"equals": url},
                    }
                },
            )
            pages = results.get("results", [])
            return pages[0]["id"] if pages else None
        except Exception as e:
            print(f"[NOTION ERROR] Failed to query by URL: {e}")
            return None

    def _build_properties(
        self,
        title: str,
        company: str,
        url: str,
        status: str,
        score: JobScore | None,
        drafted_answers: list[DraftedAnswer] | None = None,
        date_found: datetime | None = None,
        date_applied: datetime | None = None,
    ) -> dict:
        """Builds the Notion page properties dict."""
        # Use provided date_found or default to now (UTC)
        found_dt = date_found or datetime.now(timezone.utc)

        props: dict = {
            "Name": {"title": [{"text": {"content": title}}]},
            "Company": {"rich_text": [{"text": {"content": company}}]},
            "Status": {"select": {"name": status}},
            "Date Found": {"date": {"start": found_dt.isoformat()}},
        }

        if url:
            props["URL"] = {"url": url}

        if date_applied:
            props["Date Applied"] = {"date": {"start": date_applied.isoformat()}}

        if drafted_answers:
            answers_text = "\n\n".join(
                [f"Q: {a.question}\nA: {a.answer}" for a in drafted_answers]
            )
            props["Drafted Answers"] = {
                "rich_text": [{"text": {"content": answers_text[:2000]}}]
            }

        if score:
            props["Score"] = {"number": score.overall_score}
            props["Skill Overlap"] = {"number": score.skill_overlap_score}
            props["Experience"] = {"number": score.experience_score}
            props["Tech Stack"] = {"number": score.tech_stack_score}
            props["Reasoning"] = {
                "rich_text": [{"text": {"content": score.reasoning[:2000]}}]
            }

        return props
