from typing import Dict, Any, Tuple
from .base_agent import BaseAgent, Context

class DataValidationAgent(BaseAgent):
    """Agent responsible for validating extracted invoice data"""
    
    def __init__(self):
        super().__init__("DataValidationAgent")
    
    async def process(self, context: Context) -> Tuple[bool, Context]:
        """Validate the extracted data and return validation result with updated context"""
        print(f"{self.name}: Starting data validation...")
        
        if not context.structured_data:
            raise ValueError("No structured data found in context")
        
        try:
            # Validate the data
            is_valid, feedback = await self._validate_data(context.structured_data)
            
            if not is_valid:
                print(f"{self.name}: Validation failed. Feedback: {feedback}")
                context.validation_feedback = feedback
            else:
                print(f"{self.name}: Data validation successful")
                context.validation_feedback = None
            
            return is_valid, context
            
        except Exception as e:
            print(f"{self.name}: Error during data validation: {str(e)}")
            raise
    
    async def _validate_data(self, data: Dict[str, Any]) -> Tuple[bool, str]:
        """Validate the extracted invoice data"""
        required_fields = [
            'invoice_number',
            'date',
            'vendor_name',
            'total_amount',
            'line_items'
        ]
        
        missing_fields = [field for field in required_fields if field not in data or data[field] is None]
        
        if missing_fields:
            return False, f"Missing required fields: {', '.join(missing_fields)}"        
        # Validate date format (if present)
        if 'date' in data and data['date']:
            try:
                from datetime import datetime
                datetime.strptime(data['date'], '%Y-%m-%d')
            except ValueError:
                return False, f"Invalid date format. Expected YYYY-MM-DD, got {data['date']}"
        
        # Validate total amount (if present)
        if 'total_amount' in data and data['total_amount'] is not None:
            try:
                total = float(data['total_amount'])
                if total <= 0:
                    return False, "Total amount must be greater than 0"
            except (ValueError, TypeError):
                return False, f"Invalid total amount: {data['total_amount']}"
        
        # Validate line items (if present)
        if 'line_items' in data and isinstance(data['line_items'], list):
            for i, item in enumerate(data['line_items'], 1):
                if not isinstance(item, dict):
                    return False, f"Line item {i} is not a valid object"
                
                item_required_fields = ['description', 'quantity', 'unit_price', 'total_price']
                missing = [f for f in item_required_fields if f not in item or item[f] is None]
                if missing:
                    return False, f"Line item {i} missing required fields: {', '.join(missing)}"
                
                try:
                    quantity = float(item['quantity'])
                    unit_price = float(item['unit_price'])
                    total_price = float(item['total_price'])
                    
                    if quantity <= 0 or unit_price < 0 or total_price < 0:
                        return False, f"Line item {i} has invalid numeric values"
                        
                    # Check if quantity * unit_price ≈ total_price (allowing for floating point errors)
                    calculated_total = round(quantity * unit_price, 2)
                    if abs(calculated_total - total_price) > 0.01:  # Allow 0.01 difference for floating point
                        return False, f"Line item {i}: quantity * unit_price ({calculated_total}) does not match total_price ({total_price})"
                        
                except (ValueError, TypeError) as e:
                    return False, f"Line item {i} has invalid numeric values: {str(e)}"
        
        return True, ""
