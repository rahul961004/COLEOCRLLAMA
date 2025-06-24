import pytesseract
from PIL import Image
import os
from typing import Optional
from .base_agent import BaseAgent, Context
from pathlib import Path

class OCRAgent(BaseAgent):
    """Agent responsible for performing OCR on invoice documents"""
    
    def __init__(self):
        super().__init__("OCRAgent")
    
    async def process(self, context: Context) -> Context:
        """Process the invoice document and extract text using OCR"""
        print(f"{self.name}: Starting OCR processing...")
        
        try:
            # Check if file exists
            if not os.path.exists(context.invoice_path):
                raise FileNotFoundError(f"Invoice file not found: {context.invoice_path}")
            
            # Extract text using Tesseract OCR
            text = self._perform_ocr(context.invoice_path)
            
            # Update context with extracted text
            context.extracted_text = text
            print(f"{self.name}: Successfully extracted text from invoice")
            
            return context
            
        except Exception as e:
            print(f"{self.name}: Error during OCR processing: {str(e)}")
            raise
    
    def _perform_ocr(self, image_path: str) -> str:
        """Perform OCR on the given image file"""
        try:
            # Open the image file
            with Image.open(image_path) as img:
                # Perform OCR using pytesseract
                text = pytesseract.image_to_string(img)
                return text.strip()
                
        except Exception as e:
            print(f"{self.name}: Error in _perform_ocr: {str(e)}")
            raise
