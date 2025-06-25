from typing import Dict, Any
from agents import LlamaParseAgent, DataValidationAgent, Context

class InvoiceProcessingWorkflow:
    """Orchestrates the invoice processing workflow using LlamaParse"""
    
    def __init__(self):
        # Load environment variables
        # Initialize agents
        self.extract_agent = LlamaParseAgent()
        self.validation_agent = DataValidationAgent()

    async def process_invoice(self, invoice_path: str) -> Dict[str, Any]:
        """Process a single invoice through the workflow"""
        print(f"Starting invoice processing for: {invoice_path}")
        
        # Initialize context
        context = Context(
            invoice_path=invoice_path
        )
        
        try:
            # 1. Extract data using LlamaParse (Parse with LVM)
            context = await self.extract_agent.process(context)
            
            # 2. Validate the extracted data
            is_valid, context = await self.validation_agent.process(context)
            
            if not is_valid:
                status = "warning"
                message = "Validation failed"
            else:
                status = "success"
                message = "Invoice processed successfully"

            print(f"{status.capitalize()} processing invoice: {invoice_path}")
            return {
                "status": status,
                "invoice_path": invoice_path,
                "extracted_data": context.structured_data or {},
                "validation_feedback": context.validation_feedback
            }
            
        except Exception as e:
            error_msg = f"Error processing invoice {invoice_path}: {str(e)}"
            print(error_msg)
            return {
                "status": "error",
                "invoice_path": invoice_path,
                "error": error_msg
            }
