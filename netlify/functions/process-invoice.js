const { OpenAI } = require('openai');
const FormData = require('form-data');
const { Readable } = require('stream');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Assistant IDs
const ASSISTANTS = {
  OCR: 'asst_aNfZhZ89VDaG9gtVdmVR0QQn',
  EXCEL: 'asst_bimEPdweitmELhnT9QIMAC0J'
};

// Helper function to parse multipart form data
async function parseMultipartFormData(event) {
  const boundary = event.headers['content-type'].split('boundary=')[1];
  const body = Buffer.from(event.body, 'base64');
  const parts = body.toString('binary').split(`--${boundary}`);
  
  const files = [];
  
  for (const part of parts) {
    if (part.includes('Content-Disposition: form-data; name="files"')) {
      const filenameMatch = part.match(/filename="([^"]+)"/);
      if (!filenameMatch) continue;
      
      const filename = filenameMatch[1];
      const contentTypeMatch = part.match(/Content-Type: ([^\r\n]+)/);
      const contentType = contentTypeMatch ? contentTypeMatch[1].trim() : 'application/octet-stream';
      
      // Extract file content
      const fileContentMatch = part.match(/\r\n\r\n([\s\S]*?)\r\n--/);
      if (!fileContentMatch) continue;
      
      const fileContent = Buffer.from(fileContentMatch[1], 'binary');
      
      files.push({
        filename,
        contentType,
        file: fileContent
      });
    }
  }
  
  if (files.length === 0) {
    throw new Error('No files found in the request');
  }
  
  return files;
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

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ message: 'Method not allowed' })
    };
  }

  try {
    // Parse the uploaded files
    const files = await parseMultipartFormData(event);
    
    if (files.length === 0) {
      throw new Error('No valid files were uploaded. Please upload image or PDF files.');
    }
    
    console.log(`Processing ${files.length} files...`);
    
    // Process each file and collect promises
    const processPromises = files.map(async (file, index) => {
      console.log(`Uploading file ${index + 1}/${files.length}: ${file.filename}`);
      
      // Upload file to OpenAI
      const openaiFile = await openai.files.create({
        file: file.file,
        purpose: 'assistants'
      });
      
      try {
        console.log(`Processing file ${index + 1} with OCR...`);
        
        // Step 1: Process with OCR Assistant
        const ocrThread = await openai.beta.threads.create({
          messages: [{
            role: 'user',
            content: 'Please extract all the data from this invoice in a structured JSON format.',
            file_ids: [openaiFile.id]
          }]
        });
        
        const ocrRun = await openai.beta.threads.runs.create(
          ocrThread.id,
          { assistant_id: ASSISTANTS.OCR }
        );
        
        // Wait for OCR processing to complete
        console.log(`Waiting for OCR to complete for file ${index + 1}...`);
        await waitForRunCompletion(ocrThread.id, ocrRun.id);
        
        // Get the OCR results
        const ocrMessages = await openai.beta.threads.messages.list(ocrThread.id);
        const ocrContent = ocrMessages.data[0].content[0];
        
        if (ocrContent.type !== 'text' || !ocrContent.text) {
          throw new Error('Unexpected response format from OCR assistant');
        }
        
        return {
          filename: file.filename,
          content: ocrContent.text.value
        };
      } finally {
        // Clean up the uploaded file
        try {
          await openai.files.del(openaiFile.id);
        } catch (e) {
          console.warn(`Failed to delete file ${file.filename}:`, e);
        }
      }
    });
    
    // Wait for all files to be processed
    const ocrResults = await Promise.all(processPromises);
    
    // Combine all OCR results with file names
    const combinedResults = ocrResults.map(result => 
      `=== ${result.filename } ===\n${result.content}`
    ).join('\n\n');
    
    console.log('All files processed. Generating Excel...');
    
    // Step 2: Process with Excel Assistant
    const excelThread = await openai.beta.threads.create({
      messages: [{
        role: 'user',
        content: `Convert these invoice data into a single Excel file with multiple sheets. Each invoice should be in a separate sheet named after the invoice number or filename.\n\n${combinedResults}`
      }]
    });
    
    const excelRun = await openai.beta.threads.runs.create(
      excelThread.id,
      { assistant_id: ASSISTANTS.EXCEL }
    );
    
    console.log('Waiting for Excel generation to complete...');
    await waitForRunCompletion(excelThread.id, excelRun.id);
    
    // Get the Excel file ID from the assistant's response
    const excelMessages = await openai.beta.threads.messages.list(excelThread.id);
    const excelFileId = excelMessages.data[0].file_ids?.[0];
    
    if (!excelFileId) {
      throw new Error('No Excel file was generated by the assistant');
    }
    
    // Download the Excel file
    console.log('Downloading generated Excel file...');
    const excelFile = await openai.files.content(excelFileId);
    const excelBuffer = Buffer.from(await excelFile.arrayBuffer());
    
    // Clean up the Excel file
    try {
      await openai.files.del(excelFileId);
    } catch (e) {
      console.warn('Failed to delete Excel file:', e);
    }
    
    console.log('Sending response...');
    
    // Return the Excel file
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="invoices_${Date.now()}.xlsx"`,
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      body: excelBuffer.toString('base64'),
      isBase64Encoded: true
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
