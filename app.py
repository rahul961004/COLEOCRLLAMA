from fastapi import FastAPI, UploadFile, File, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse
from pathlib import Path
import shutil
import os
import uuid
from typing import Optional, List, Dict, Any
import asyncio
import json
from dotenv import load_dotenv
from workflow import InvoiceProcessingWorkflow

# Load environment variables
load_dotenv()

# Validate required environment variables
if not os.getenv("LLAMA_CLOUD_API_KEY"):
    raise ValueError("LLAMA_CLOUD_API_KEY environment variable is required")

app = FastAPI(title="Invoice Processing API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Create necessary directories
UPLOAD_DIR = "uploads"
OUTPUT_DIR = "output"
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Initialize workflow
workflow = InvoiceProcessingWorkflow()

# Helper function to get a unique filename
def get_unique_filename(directory: str, filename: str) -> str:
    """Generate a unique filename in the specified directory"""
    ext = Path(filename).suffix
    unique_id = str(uuid.uuid4())[:8]
    return os.path.join(directory, f"{Path(filename).stem}_{unique_id}{ext}")

@app.post("/process-invoice/")
async def process_invoice(
    file: UploadFile = File(..., description="The invoice file to process (PDF, JPG, PNG)"),
    output_excel: Optional[str] = "invoices.xlsx"
):
    """
    Process an uploaded invoice file using LlamaExtract.
    
    This endpoint accepts an invoice file, processes it using LlamaExtract for OCR and data extraction,
    and saves the results to an Excel file.
    """
    # Validate file type
    allowed_extensions = {'.pdf', '.jpg', '.jpeg', '.png'}
    file_ext = Path(file.filename).suffix.lower()
    if file_ext not in allowed_extensions:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type not supported. Allowed types: {', '.join(allowed_extensions)}"
        )
    
    try:
        # Save the uploaded file with a unique name
        file_path = get_unique_filename(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Set output path
        output_path = os.path.join(OUTPUT_DIR, output_excel)
        
        # Process the invoice
        result = await workflow.process_invoice(file_path, output_path)
        
        # Clean up the uploaded file
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Warning: Failed to delete temporary file {file_path}: {str(e)}")
        
        return {
            "status": "success",
            "message": "Invoice processed successfully",
            "data": result.get("extracted_data", {}),
            "excel_file": f"/download/{output_excel}"
        }
        
    except Exception as e:
        # Clean up in case of error
        if 'file_path' in locals() and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except:
                pass
        
        error_msg = f"Error processing invoice: {str(e)}"
        print(error_msg)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=error_msg
        )

@app.get("/download/{filename}")
async def download_file(filename: str):
    """Download a processed file"""
    file_path = os.path.join(OUTPUT_DIR, filename)
    if not os.path.exists(file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"File not found: {filename}"
        )
    return FileResponse(
        file_path,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        filename=filename
    )

@app.get("/health")
async def health_check():
    """
    Health check endpoint
    
    Returns the status of the API and its dependencies
    """
    return {
        "status": "healthy",
        "version": "1.0.0",
        "dependencies": {
            "llama_cloud_services": "available" if os.getenv("LLAMA_CLOUD_API_KEY") else "missing_api_key"
        }
    }

if __name__ == "__main__":
    import uvicorn
    
    # Print startup information
    print("Starting Llama OCR API server...")
    print(f"Upload directory: {os.path.abspath(UPLOAD_DIR)}")
    print(f"Output directory: {os.path.abspath(OUTPUT_DIR)}")
    
    # Start the server
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        workers=1
    )
