from typing import Dict, Any, Optional, List
from pydantic import BaseModel, Field, field_validator
from llama_cloud_services import LlamaExtract
import os
from pathlib import Path
from .base_agent import BaseAgent, Context

# Define the schema for invoice data using Pydantic
class LineItem(BaseModel):
    """Schema for invoice line items"""
    description: str = Field(..., description="Description of the item")
    quantity: float = Field(..., description="Quantity of the item")
    unit_price: float = Field(..., description="Price per unit")
    total_price: float = Field(..., description="Total price for the line item")

class InvoiceData(BaseModel):
    """Schema for the entire invoice"""
    invoice_number: str = Field(..., description="The invoice number")
    date: str = Field(..., description="Invoice date in YYYY-MM-DD format")
    vendor_name: str = Field(..., description="Name of the vendor or company")
    total_amount: float = Field(..., description="Total amount of the invoice")
    line_items: List[LineItem] = Field(..., description="List of line items")
    
    @field_validator('date')
    def validate_date_format(cls, v):
        from datetime import datetime
        try:
            datetime.strptime(v, '%Y-%m-%d')
            return v
        except ValueError:
            raise ValueError("Date must be in YYYY-MM-DD format")

class LlamaExtractAgent(BaseAgent):
    """
    Agent that uses LlamaExtract to perform OCR and data extraction in one step.
    This combines the functionality of both OCR and data extraction agents.
    """
    
    def __init__(self, model_name: str = "gpt-4"):
        super().__init__("LlamaExtractAgent")
        self.model_name = model_name
        self.extractor = LlamaExtract()
        
    async def process(self, context: Context) -> Context:
        """Process the invoice document and extract structured data using LlamaExtract"""
        print(f"{self.name}: Starting invoice processing with LlamaExtract...")
        
        try:
            # Check if file exists
            if not os.path.exists(context.invoice_path):
                raise FileNotFoundError(f"Invoice file not found: {context.invoice_path}")
            
            # Create an extraction agent with our schema
            agent = self.extractor.create_agent(
                name="invoice-extractor",
                data_schema=InvoiceData
            )
            
            # Extract data from the document
            print(f"{self.name}: Extracting data from {context.invoice_path}...")
            result = agent.extract(context.invoice_path)
            
            if not result.success:
                raise ValueError(f"Failed to extract data: {result.error}")
            
            # Update context with extracted data
            context.structured_data = result.data
            context.extracted_text = str(result.data)  # Store string representation for reference
            
            print(f"{self.name}: Successfully extracted and structured invoice data")
            return context
            
        except Exception as e:
            print(f"{self.name}: Error during invoice processing: {str(e)}")
            raise
