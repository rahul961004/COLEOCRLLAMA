// Import required modules
const { OpenAI } = require('openai');
const { Buffer } = require('buffer');

// Initialize OpenAI client with environment variable
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Assistant ID for the OCR assistant
const ASSISTANT_ID = 'asst_aNfZhZ89VDaG9gtVdmVR0QQn';

// Helper function to handle errors
function createErrorResponse(statusCode, message, details = null) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS'
    },
    body: JSON.stringify({
      success: false,
      error: message,
      ...(details && { details })
    })
  };
}

/**
 * Uploads a file to OpenAI and returns the file ID
 */
async function uploadFileToOpenAI(fileData) {
  try {
    const { name, data } = fileData;
    console.log(`Uploading file: ${name} (${data.length} bytes)`);
    
    const buffer = Buffer.from(data, 'base64');
    
    // Upload the file to OpenAI
    const file = await openai.files.create({
      file: buffer,
      purpose: 'assistants',
      filename: name
    });
    
    console.log(`File uploaded successfully. File ID: ${file.id}`);
    return file.id;
    
  } catch (error) {
    console.error('Error uploading file to OpenAI:', error);
    throw new Error(`Failed to upload file: ${error.message}`);
  }
}

/**
 * Processes a file with the OCR assistant
 */
async function processFileWithOCR(fileData) {
  try {
    // 1. Upload the file to OpenAI
    console.log('Starting file upload...');
    const fileId = await uploadFileToOpenAI(fileData);
    
    // 2. Create a thread
    console.log('Creating thread...');
    const thread = await openai.beta.threads.create();
    
    // 3. Add the file to the thread with a clear instruction
    console.log('Adding message to thread...');
    await openai.beta.threads.messages.create(
      thread.id,
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'Please extract all the information from this file and return it in a structured JSON format. Include fields like vendor_name, invoice_number, invoice_date, line_items, subtotal, tax, and total.'
          },
          {
            type: 'file',
            file_id: fileId
          }
        ]
      }
    );
    
    // 4. Run the assistant
    console.log('Running assistant...');
    const run = await openai.beta.threads.runs.create(
      thread.id,
      {
        assistant_id: ASSISTANT_ID,
        instructions: 'You are an expert at extracting structured data from invoices and receipts. Extract all relevant information and return it in a clean JSON format.'
      }
    );
    
    console.log(`Run created with ID: ${run.id}`);
    
    // 5. Wait for the run to complete
    console.log('Waiting for run to complete...');
    const completedRun = await waitForRunCompletion(thread.id, run.id);
    
    if (completedRun.status !== 'completed') {
      console.error('Run did not complete successfully:', completedRun);
      throw new Error(`Run failed with status: ${completedRun.status}. Last error: ${completedRun.last_error?.message || 'No error details'}`);
    }
    
    // 6. Get the assistant's response
    console.log('Retrieving assistant response...');
    const messages = await openai.beta.threads.messages.list(thread.id);
    const assistantMessages = messages.data
      .filter(m => m.role === 'assistant' && m.content.length > 0);
    
    if (assistantMessages.length === 0) {
      throw new Error('No response from assistant');
    }
    
    // 7. Extract the response from the latest assistant message
    const latestMessage = assistantMessages[0];
    const response = latestMessage.content[0];
    
    if (response.type === 'text') {
      console.log('Received text response from assistant');
      // Try to extract JSON from code blocks
      const textContent = response.text.value;
      try {
        // Try to find JSON in code blocks
        const jsonMatch = textContent.match(/```(?:json)?\n([\s\S]*?)\n```/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[1]);
        }
        // If no code block, try to parse the entire content as JSON
        return JSON.parse(textContent);
      } catch (e) {
        console.log('Could not parse response as JSON, returning as text');
        return { extracted_text: textContent };
      }
    } else if (response.type === 'file') {
      console.log('Received file response from assistant');
      return { fileId: response.file_id };
    }
    
    return response;
    
  } catch (error) {
    console.error('Error in processFileWithOCR:', error);
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

/**
 * Waits for a run to complete and returns the final run status
 */
async function waitForRunCompletion(threadId, runId, maxAttempts = 30) {
  let attempts = 0;
  let run;
  
  while (attempts < maxAttempts) {
    attempts++;
    
    try {
      run = await openai.beta.threads.runs.retrieve(threadId, runId);
      console.log(`Run status (attempt ${attempts}/${maxAttempts}):`, run.status);
      
      // If the run is completed, return the result
      if (run.status === 'completed') {
        return run;
      }
      
      // If the run failed, throw an error
      if (run.status === 'failed' || run.status === 'cancelled' || run.status === 'expired') {
        console.error('Run failed with status:', run.status);
        if (run.last_error) {
          console.error('Last error:', run.last_error);
        }
        throw new Error(`Run ${run.status}: ${run.last_error?.message || 'No error details'}`);
      }
      
      // If the run requires action, handle it (e.g., function calling)
      if (run.status === 'requires_action' && run.required_action?.submit_tool_outputs) {
        console.log('Run requires action, submitting empty outputs...');
        await openai.beta.threads.runs.submitToolOutputs(
          threadId,
          runId,
          { tool_outputs: [] } // Submit empty outputs for now
        );
      }
      
      // Wait before polling again
      await new Promise(resolve => setTimeout(resolve, 2000)); // 2 seconds
      
    } catch (error) {
      console.error('Error in waitForRunCompletion:', error);
      throw new Error(`Failed to complete run: ${error.message}`);
    }
  }
  
  throw new Error(`Run did not complete after ${maxAttempts} attempts. Last status: ${run?.status}`);
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
    console.log('Received request with headers:', event.headers);
    console.log('Request body length:', event.body?.length || 0);

    // Parse the request body
    let body;
    try {
      body = JSON.parse(event.body);
    } catch (e) {
      console.error('Error parsing request body:', e);
      return createErrorResponse(400, 'Invalid JSON in request body');
    }

    // Check for files in the request
    if (!body.files || !Array.isArray(body.files) || body.files.length === 0) {
      return createErrorResponse(400, 'No files provided in the request');
    }

    console.log(`Processing ${body.files.length} file(s)...`);

    // Process each file
    const results = [];
    for (const [index, file] of body.files.entries()) {
      if (!file.name || !file.data) {
        console.error(`File at index ${index} is missing name or data`);
        results.push({
          fileName: file.name || `file-${index}`,
          success: false,
          error: 'Invalid file format. Each file must have a name and data.'
        });
        continue;
      }

      try {
        console.log(`Processing file ${index + 1}/${body.files.length}: ${file.name} (${file.data.length} bytes)`);
        const result = await processFileWithOCR({
          name: file.name,
          data: file.data
        });
        
        console.log(`Successfully processed file: ${file.name}`);
        results.push({
          fileName: file.name,
          success: true,
          data: result
        });
      } catch (error) {
        console.error(`Error processing file ${file.name}:`, error);
        results.push({
          fileName: file.name,
          success: false,
          error: error.message,
          stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
      }
    }

    // Check if any files were processed successfully
    const hasSuccess = results.some(r => r.success);
    
    // Return the results
    return {
      statusCode: hasSuccess ? 200 : 400,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      },
      body: JSON.stringify({
        success: hasSuccess,
        timestamp: new Date().toISOString(),
        processedCount: results.filter(r => r.success).length,
        errorCount: results.filter(r => !r.success).length,
        results
      }, null, 2)
    };

  } catch (error) {
    console.error('Unexpected error in handler:', error);
    return createErrorResponse(500, 'Internal Server Error', {
      message: error.message,
      ...(process.env.NODE_ENV === 'development' ? { stack: error.stack } : {})
    });
  }
};

// Helper function to wait for a run to complete
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
