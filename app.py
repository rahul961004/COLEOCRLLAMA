from fastapi import FastAPI, File, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional
from workflow import InvoiceProcessingWorkflow
import uuid
from fastapi.responses import FileResponse
from pathlib import Path
import shutil
import os

# Only load .env locally
if os.getenv("ENV", "development") == "development":
    from dotenv import load_dotenv
    load_dotenv()

app = FastAPI()

# Restrict CORS in production by setting allowed origins in environment
origins = os.getenv("CORS_ALLOW_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = Path("uploads")
DOWNLOAD_DIR = Path("output")
UPLOAD_DIR.mkdir(exist_ok=True)
DOWNLOAD_DIR.mkdir(exist_ok=True)

# Main processing endpoint
@app.post("/process-invoice/")
async def process_invoice(file: UploadFile = File(...)):
    try:
        # Save upload
        file_path = UPLOAD_DIR / f"{uuid.uuid4()}_{file.filename}"
        with open(file_path, "wb") as f:
            f.write(await file.read())
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # Process the invoice
        result = await workflow.process_invoice(file_path)
        
        # Clean up the uploaded file
        try:
            os.remove(file_path)
        except Exception as e:
            print(f"Warning: Failed to delete temporary file {file_path}: {str(e)}")
        
        return {
            "status": "success",
            "message": "Invoice processed successfully",
            "data": result.get("extracted_data", {})
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

# Removed download endpoint
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
