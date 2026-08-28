from pathlib import Path
from typing import Optional

import pandas as pd
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from docx import Document as DocxDocument
from pypdf import PdfReader
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression


class UploadResponse(BaseModel):
    filename: str
    extracted_text: str
    cleaned_text: str
    word_count: int
    saved_path: str
    category: str
    confidence: float
    matched_keywords: list[str]


class BatchUploadResponse(BaseModel):
    documents: list[UploadResponse]


MAX_BATCH_UPLOADS = 5


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
        return await process_upload(file, upload_path)

    @app.post("/uploads", response_model=BatchUploadResponse)
    async def upload_files(files: list[UploadFile] = File(...)) -> BatchUploadResponse:
        if not files or len(files) > MAX_BATCH_UPLOADS:
            raise HTTPException(status_code=400, detail="You can upload a maximum of 5 documents at a time")

        allowed_types = {"application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
        if any(file.content_type not in allowed_types for file in files):
            raise HTTPException(status_code=400, detail="All documents must be PDF or DOCX files")

        documents = [await process_upload(file, upload_path) for file in files]
        return BatchUploadResponse(documents=documents)

    @app.get("/documents")
    def list_documents() -> list[dict[str, str | int | float | list[str]]]:
        documents = []
        for path in sorted(upload_path.iterdir()):
            if path.is_file():
                try:
                    text = extract_text(path)
                    classification = classify_document(text, path.name)
                except Exception:
                    classification = {"category": "General", "confidence": 0.15, "matched_keywords": []}
                documents.append({
                    "filename": path.name,
                    "size": str(path.stat().st_size),
                    "path": str(path),
                    "category": classification["category"],
                    "confidence": classification["confidence"],
                    "matched_keywords": classification["matched_keywords"],
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


async def process_upload(file: UploadFile, upload_path: Path) -> UploadResponse:
    filename = Path(file.filename or "document").name
    destination = upload_path / filename
    contents = await file.read()
    destination.write_bytes(contents)

    extracted_text = extract_text(destination)
    cleaned_text = preprocess_text(extracted_text)
    word_count = len(cleaned_text.split())
    classification = classify_document(cleaned_text, filename)
    return UploadResponse(
        filename=filename,
        extracted_text=extracted_text,
        cleaned_text=cleaned_text,
        word_count=word_count,
        saved_path=str(destination),
        category=classification["category"],
        confidence=classification["confidence"],
        matched_keywords=classification["matched_keywords"],
    )


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


TRAINING_DOCUMENTS = [
    ("employee benefits leave payroll recruitment staff training", "HR"),
    ("performance review workplace policy employee handbook annual leave", "HR"),
    ("invoice budget revenue expense financial forecast profit tax", "Finance"),
    ("cash flow accounts payable quarterly budget cost analysis", "Finance"),
    ("contract agreement liability legal clause compliance privacy terms", "Legal"),
    ("vendor agreement termination audit regulatory requirements", "Legal"),
    ("software API database backend server deployment cloud security", "Technical"),
    ("application code frontend system architecture technical documentation", "Technical"),
    ("workflow inventory supply shipment logistics vendor delivery", "Operations"),
    ("operations process facility timeline procurement business continuity", "Operations"),
]

TRAINING_TEXTS = [text for text, _ in TRAINING_DOCUMENTS]
TRAINING_LABELS = [label for _, label in TRAINING_DOCUMENTS]
CLASSIFIER_VECTORIZER = TfidfVectorizer(
    lowercase=True,
    stop_words="english",
    ngram_range=(1, 2),
)
CLASSIFIER = LogisticRegression(C=5.0, max_iter=1000, random_state=42)
CLASSIFIER.fit(CLASSIFIER_VECTORIZER.fit_transform(TRAINING_TEXTS), TRAINING_LABELS)


def classify_document(text: str, filename: str = "") -> dict[str, object]:
    cleaned_text = preprocess_text(f"{filename} {text}")
    vector = CLASSIFIER_VECTORIZER.transform([cleaned_text])
    probabilities = CLASSIFIER.predict_proba(vector)[0]
    best_index = probabilities.argmax()
    best_category = str(CLASSIFIER.classes_[best_index])
    best_score = float(probabilities[best_index])
    feature_names = CLASSIFIER_VECTORIZER.get_feature_names_out()
    matched_keywords = sorted(
        feature_names[index]
        for index in vector.nonzero()[1]
        if " " not in feature_names[index]
    )[:5]
    return {
        "category": best_category,
        "confidence": round(best_score, 2),
        "matched_keywords": matched_keywords,
    }
