const { OpenAI } = require('openai');
const { Agent } = require('@openai/agents');
const { Buffer } = require('buffer');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Initialize the OCR agent
const ocrAgent = new Agent({
  model: 'gpt-4-vision-preview',
  systemMessage: `You are an expert at extracting structured data from invoices and receipts. 
  Extract all relevant information including:
  - Vendor details (name, address, contact)
  - Invoice number and date
  - Line items (description, quantity, unit price, total)
  - Tax and total amounts
  - Payment terms
  - Any other relevant information
  
  Return the data in a structured JSON format.`
});

// Helper function to process file with OCR agent
async function processFileWithOCR(fileData) {
  try {
    const { name, type, data } = fileData;
    
    // Convert base64 to buffer
    const buffer = Buffer.from(data, 'base64');
    
    // Create a file-like object for the agent
    const file = {
      name,
      type,
      data: buffer,
      size: buffer.length
    };
    
    // Process the file with the OCR agent
    const response = await ocrAgent.run({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'Extract all data from this invoice.' },
          { type: 'file', file }
        ]
      }]
    });
    
    // Extract the structured data from the response
    const result = response.choices?.[0]?.message?.content;
    if (!result) {
      throw new Error('No content in agent response');
    }
    
    // Try to parse the result as JSON
    try {
      return JSON.parse(result);
    } catch (e) {
      console.warn('Failed to parse agent response as JSON, returning as text');
      return { text: result };
    }
    
  } catch (error) {
    console.error('Error processing file with OCR:', error);
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

// Helper function to wait for run completion
async function waitForRunCompletion(threadId, runId) {
  let run = await openai.beta.threads.runs.retrieve(threadId, runId);
  
  let attempts = 0;
  const maxAttempts = 30; // 30 seconds max
  
  while ((run.status === 'queued' || run.status === 'in_progress') && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 2000)); // Check every 2 seconds
    run = await openai.beta.threads.runs.retrieve(threadId, runId);
    attempts++;
  }
  
  if (run.status !== 'completed') {
    throw new Error(`Run did not complete successfully. Status: ${run.status}, Last error: ${run.last_error?.message || 'None'}`);
  }
  
  return run;
}

// Main handler function
exports.handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
      body: ''
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Parse the request body
    let files = [];
    try {
      const body = JSON.parse(event.body || '{}');
      files = Array.isArray(body.files) ? body.files : [];
    } catch (e) {
      console.error('Error parsing request body:', e);
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'Invalid request body' })
      };
    }

    if (files.length === 0) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({ error: 'No files provided' })
      };
    }

    console.log(`Processing ${files.length} files...`);
    
    // Process each file with the OCR agent
    const processingPromises = files.map(file => 
      processFileWithOCR(file).catch(error => ({
        filename: file.name || 'unknown',
        error: error.message,
        success: false
      }))
    );
    
    // Wait for all files to be processed
    const results = await Promise.all(processingPromises);
    
    // Check for any processing errors
    const hasErrors = results.some(result => result.error);
    if (hasErrors) {
      console.error('Some files failed to process:', results);
      return {
        statusCode: 207, // Multi-status
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
          message: 'Some files could not be processed',
          results
        })
      };
    }
    
    // Return the extracted data
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: JSON.stringify({
        success: true,
        data: results,
        processedAt: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Error processing invoice:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      })
    };
  }
};

// Helper function to wait for run completion
async function waitForRunCompletion(threadId, runId, expectFile = false) {
  let run = await openai.beta.threads.runs.retrieve(threadId, runId);
  let attempts = 0;
  const maxAttempts = 120; // 2 minutes max (120 * 1000ms)
  
  while ((run.status === 'queued' || run.status === 'in_progress') && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    run = await openai.beta.threads.runs.retrieve(threadId, runId);
    attempts++;
    console.log(`Run status (attempt ${attempts}):`, run.status);
  }

  if (run.status === 'completed') {
    const messages = await openai.beta.threads.messages.list(threadId);
    const lastMessage = messages.data[0];
    
    if (expectFile && lastMessage.content[0].type === 'file') {
      return { file_id: lastMessage.file_id };
    } else if (lastMessage.content[0].type === 'text') {
      return lastMessage.content[0].text.value;
    } else {
      throw new Error('Unexpected response format from assistant');
    }
  } else if (attempts >= maxAttempts) {
    throw new Error('Processing timed out. Please try again.');
  } else {
    throw new Error(`Run failed with status: ${run.status}`);
  }
}
