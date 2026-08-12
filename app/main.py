from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from docx import Document as DocxDocument
from pypdf import PdfReader


class UploadResponse(BaseModel):
    filename: str
    extracted_text: str
    cleaned_text: str
    word_count: int
    saved_path: str


def create_app(upload_dir: Optional[Path] = None) -> FastAPI:
    app = FastAPI(title="AI Knowledge Assistant")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    upload_path = Path(upload_dir) if upload_dir is not None else Path("uploads")
    upload_path.mkdir(parents=True, exist_ok=True)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/upload", response_model=UploadResponse)
    async def upload_file(file: UploadFile = File(...)) -> UploadResponse:
        allowed_types = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
        if file.content_type not in allowed_types:
            raise HTTPException(status_code=400, detail="Unsupported file type")

        destination = upload_path / file.filename
        contents = await file.read()
        destination.write_bytes(contents)

        extracted_text = extract_text(destination)
        cleaned_text = preprocess_text(extracted_text)
        word_count = len(cleaned_text.split())
        return UploadResponse(
            filename=file.filename,
            extracted_text=extracted_text,
            cleaned_text=cleaned_text,
            word_count=word_count,
            saved_path=str(destination),
        )

    @app.get("/documents")
    def list_documents() -> list[dict[str, str]]:
        documents = []
        for path in sorted(upload_path.iterdir()):
            if path.is_file():
                documents.append({
                    "filename": path.name,
                    "size": str(path.stat().st_size),
                    "path": str(path),
                })
        return documents

    @app.delete("/documents/{filename}")
    def delete_document(filename: str) -> dict[str, bool]:
        target = upload_path / filename
        if not target.exists():
            raise HTTPException(status_code=404, detail="Document not found")
        target.unlink()
        return {"deleted": True}

    return app


app = create_app()


def extract_text(path: Path) -> str:
    if path.suffix.lower() == ".pdf":
        reader = PdfReader(str(path))
        pages = [page.extract_text() or "" for page in reader.pages]
        return "\n".join(pages).strip()

    if path.suffix.lower() == ".docx":
        document = DocxDocument(str(path))
        return "\n".join(paragraph.text for paragraph in document.paragraphs if paragraph.text).strip()

    raise ValueError("Unsupported file type")


def preprocess_text(text: str) -> str:
    cleaned = " ".join(text.split())
    df = pd.DataFrame({"text": [cleaned]})
    return df.loc[0, "text"]
