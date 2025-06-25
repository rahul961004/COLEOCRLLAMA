from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
from dataclasses import dataclass

@dataclass
class Context:
    """Shared context for workflow state management"""
    invoice_path: str
    job_id: Optional[str] = None
    status: Optional[str] = None
    structured_data: Optional[Dict[str, Any]] = None
    markdown_docs: Optional[Any] = None
    text_docs: Optional[Any] = None

class BaseAgent(ABC):
    """Base class for all agents in the workflow"""
    
    def __init__(self, name: str):
        self.name = name
    
    @abstractmethod
    async def process(self, context: Context) -> Context:
        """Process the context and return updated context"""
        pass
