from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    NOTION_API_KEY: str = ""
    NOTION_DATABASE_ID: str = ""
    GEMINI_API_KEY: str = ""
    
    class Config:
        env_file = ".env"

settings = Settings()
