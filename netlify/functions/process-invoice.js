const { OpenAI } = require('openai');
const { Buffer } = require('buffer');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Assistant ID for the OCR assistant
const ASSISTANT_ID = 'asst_aNfZhZ89VDaG9gtVdmVR0QQn'; // Replace with your assistant ID

/**
 * Uploads a file to OpenAI and returns the file ID
 */
async function uploadFileToOpenAI(fileData) {
  const { name, type, data } = fileData;
  const buffer = Buffer.from(data, 'base64');
  
  const file = await openai.files.create({
    file: buffer,
    purpose: 'assistants',
    filename: name
  });
  
  return file.id;
}

/**
 * Processes a file with the OCR assistant
 */
async function processFileWithOCR(fileData) {
  try {
    // Upload the file to OpenAI
    const fileId = await uploadFileToOpenAI(fileData);
    
    // Create a thread and run the assistant
    const thread = await openai.beta.threads.create({
      messages: [
        {
          role: 'user',
          content: 'Extract all data from this invoice in a structured JSON format.',
          file_ids: [fileId]
        }
      ]
    });
    
    // Run the assistant
    const run = await openai.beta.threads.runs.create(
      thread.id,
      { 
        assistant_id: ASSISTANT_ID,
        instructions: `You are an expert at extracting structured data from invoices and receipts. 
        Extract all relevant information including:
        - Vendor details (name, address, contact)
        - Invoice number and date
        - Line items (description, quantity, unit price, total)
        - Tax and total amounts
        - Payment terms
        - Any other relevant information
        
        Return the data in a structured JSON format.`
      }
    );
    
    // Wait for the run to complete
    const completedRun = await waitForRunCompletion(thread.id, run.id);
    
    if (completedRun.status !== 'completed') {
      throw new Error(`Run failed with status: ${completedRun.status}`);
    }
    
    // Get the messages from the thread
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];
    
    if (!lastMessage || !lastMessage.content || lastMessage.content.length === 0) {
      throw new Error('No response from assistant');
    }
    
    // Extract the text content from the message
    const textContent = lastMessage.content
      .filter(part => part.type === 'text')
      .map(part => part.text.value)
      .join('\n');
    
    if (!textContent) {
      throw new Error('No text content in the assistant response');
    }
    
    // Try to parse the result as JSON
    try {
      return JSON.parse(textContent);
    } catch (e) {
      console.warn('Failed to parse assistant response as JSON, returning as text');
      return { text: textContent };
    }
    
  } catch (error) {
    console.error('Error processing file with OCR:', error);
    throw new Error(`Failed to process file: ${error.message}`);
  }
}

/**
 * Waits for a run to complete and returns the final run status
 */
async function waitForRunCompletion(threadId, runId) {
  let run = await openai.threads.runs.retrieve(threadId, runId);
  let attempts = 0;
  const maxAttempts = 60; // 60 seconds max wait time
  
  // Wait for the run to complete
  while ((run.status === 'queued' || run.status === 'in_progress') && attempts < maxAttempts) {
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
    run = await openai.threads.runs.retrieve(threadId, runId);
    attempts++;
  }
  
  if (attempts >= maxAttempts) {
    throw new Error('Run timed out');
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
