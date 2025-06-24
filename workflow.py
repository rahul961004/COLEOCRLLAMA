import asyncio
import os
from typing import Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv
from agents import (
    LlamaParseAgent, DataValidationAgent, ExcelWriterAgent,
    Context
)

class InvoiceProcessingWorkflow:
    """Orchestrates the invoice processing workflow using LlamaParse"""
    
    def __init__(self):
        # Load environment variables
        load_dotenv()
        
        # Initialize agents
        self.extract_agent = LlamaParseAgent()
        self.validation_agent = DataValidationAgent()
        self.excel_writer_agent = ExcelWriterAgent()
        
    async def process_invoice(self, invoice_path: str, excel_sheet_path: str) -> Dict[str, Any]:
        """Process a single invoice through the workflow"""
        print(f"Starting invoice processing for: {invoice_path}")
        
        # Initialize context
        context = Context(
            invoice_path=invoice_path,
            excel_sheet_path=excel_sheet_path
        )
        
        try:
            # 1. Extract data using LlamaParse (Parse with LVM)
            context = await self.extract_agent.process(context)
            
            # 2. Validate the extracted data
            is_valid, context = await self.validation_agent.process(context)
            
            if not is_valid:
                raise ValueError("Failed to validate extracted data")
            
            # 3. Write to Excel
            context = await self.excel_writer_agent.process(context)
            
            print(f"Successfully processed invoice: {invoice_path}")
            return {
                "status": "success",
                "invoice_path": invoice_path,
                "extracted_data": context.structured_data
            }
            
        except Exception as e:
            error_msg = f"Error processing invoice {invoice_path}: {str(e)}"
            print(error_msg)
            return {
                "status": "error",
                "invoice_path": invoice_path,
                "error": error_msg
            }

async def main():
    """Example usage of the workflow"""
    import os
    from dotenv import load_dotenv
    
    # Load environment variables
    load_dotenv()
    
    # Example paths (replace with actual paths)
    invoice_path = "path/to/your/invoice.pdf"
    excel_sheet_path = "output/invoices.xlsx"
    
    # Initialize and run workflow
    workflow = InvoiceProcessingWorkflow()
    result = await workflow.process_invoice(invoice_path, excel_sheet_path)
    print("Processing result:", result)

if __name__ == "__main__":
    asyncio.run(main())
