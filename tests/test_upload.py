import io
from pathlib import Path

from fastapi.testclient import TestClient
from docx import Document

from app.main import create_app


def test_upload_docx_extracts_text(tmp_path: Path) -> None:
    app = create_app(upload_dir=tmp_path)
    client = TestClient(app)

    document = Document()
    document.add_paragraph("Hello from the AI knowledge assistant")
    buffer = io.BytesIO()
    document.save(buffer)
    buffer.seek(0)

    response = client.post(
        "/upload",
        files={
            "file": (
                "sample.docx",
                buffer.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["filename"] == "sample.docx"
    assert "Hello from the AI knowledge assistant" in payload["extracted_text"]


def test_rejects_unsupported_file_type(tmp_path: Path) -> None:
    app = create_app(upload_dir=tmp_path)
    client = TestClient(app)

    response = client.post(
        "/upload",
        files={"file": ("notes.txt", b"not supported", "text/plain")},
    )

    assert response.status_code == 400
    assert "Unsupported file type" in response.json()["detail"]


def test_lists_uploaded_documents(tmp_path: Path) -> None:
    app = create_app(upload_dir=tmp_path)
    client = TestClient(app)

    file_path = tmp_path / "example.docx"
    file_path.write_bytes(b"fake docx content")

    response = client.get("/documents")

    assert response.status_code == 200
    payload = response.json()
    assert any(item["filename"] == "example.docx" for item in payload)


def test_deletes_uploaded_document(tmp_path: Path) -> None:
    app = create_app(upload_dir=tmp_path)
    client = TestClient(app)

    file_path = tmp_path / "example.docx"
    file_path.write_bytes(b"fake docx content")

    response = client.delete("/documents/example.docx")

    assert response.status_code == 200
    assert response.json()["deleted"] is True
    assert not file_path.exists()


def test_upload_classifies_document_category(tmp_path: Path) -> None:
    app = create_app(upload_dir=tmp_path)
    client = TestClient(app)

    document = Document()
    document.add_paragraph("Employee benefits policy and annual leave for staff training")
    buffer = io.BytesIO()
    document.save(buffer)
    buffer.seek(0)

    response = client.post(
        "/upload",
        files={
            "file": (
                "hr-policy.docx",
                buffer.getvalue(),
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            )
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["category"] == "HR"
    assert payload["confidence"] >= 0.5

    def test_batch_upload_processes_and_categorizes_each_document(tmp_path: Path) -> None:
        app = create_app(upload_dir=tmp_path)
        client = TestClient(app)

        response = client.post(
            "/uploads",
            files=[
                ("files", ("hr-policy.docx", _docx_bytes("Employee benefits and annual leave policy"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
                ("files", ("api-guide.docx", _docx_bytes("API backend database deployment and server security"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document")),
            ],
        )

        assert response.status_code == 200
        documents = response.json()["documents"]
        assert len(documents) == 2
        assert documents[0]["category"] == "HR"
        assert documents[1]["category"] == "Technical"


    def test_batch_upload_rejects_more_than_five_documents(tmp_path: Path) -> None:
        app = create_app(upload_dir=tmp_path)
        client = TestClient(app)
        files = [
            ("files", (f"document-{index}.docx", _docx_bytes("Employee policy"), "application/vnd.openxmlformats-officedocument.wordprocessingml.document"))
            for index in range(6)
        ]

        response = client.post("/uploads", files=files)

        assert response.status_code == 400
        assert "5 documents" in response.json()["detail"]


    def _docx_bytes(text: str) -> bytes:
        document = Document()
        document.add_paragraph(text)
        buffer = io.BytesIO()
        document.save(buffer)
        return buffer.getvalue()
