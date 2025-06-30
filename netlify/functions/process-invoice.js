const { OpenAI } = require('openai');
const fetch = require('node-fetch');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

// Assistant IDs
const ASSISTANTS = {
  OCR: 'asst_aNfZhZ89VDaG9gtVdmVR0QQn', // Cole OCR Bot
  EXCEL: 'asst_bimEPdweitmELhnT9QIMAC0J' // Cole Excel Maker
};

// Process the invoice using Cole assistants
exports.handler = async (event) => {
  // Handle CORS
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': true
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
    // Parse the request body
    const { file, filename, contentType } = JSON.parse(event.body);
    
    if (!file) {
      throw new Error('No file provided');
    }

    // Step 1: Extract data using Cole OCR Bot
    console.log('Creating OCR thread...');
    const ocrThread = await openai.beta.threads.create({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Extract invoice data from this image and return a valid JSON object with the following fields: invoice_number, date, due_date, total_amount, vendor_name, vendor_address, customer_name, customer_address, line_items (array of objects with description, quantity, unit_price, and amount). Return ONLY the JSON object, no other text.' },
            { type: 'image_file', image_file: { file_id: file } }
          ]
        }
      ]
    });

    console.log('Starting OCR run...');
    const ocrRun = await openai.beta.threads.runs.create(
      ocrThread.id,
      { assistant_id: ASSISTANTS.OCR }
    );

    // Wait for OCR completion
    console.log('Waiting for OCR completion...');
    let ocrResult = await waitForRunCompletion(ocrThread.id, ocrRun.id);
    console.log('OCR Result:', ocrResult);
    
    // Clean up the OCR result to extract just the JSON
    const jsonMatch = ocrResult.match(/```json\n([\s\S]*?)\n```/) || ocrResult.match(/```\n([\s\S]*?)\n```/);
    const jsonString = jsonMatch ? jsonMatch[1] : ocrResult;
    const extractedData = JSON.parse(jsonString);

    // Step 2: Convert to Excel using Cole Excel Maker
    console.log('Creating Excel thread...');
    const excelThread = await openai.beta.threads.create({
      messages: [
        {
          role: 'user',
          content: [
            { 
              type: 'text', 
              text: `Convert this invoice data to a well-formatted Excel file with these sheets:
1. Invoice Details (invoice number, dates, totals)
2. Vendor & Customer Info
3. Line Items
4. Summary

Here's the data in JSON format:
\`\`\`json
${JSON.stringify(extractedData, null, 2)}
\`\`\``
            }
          ]
        }
      ]
    });

    console.log('Starting Excel run...');
    const excelRun = await openai.beta.threads.runs.create(
      excelThread.id,
      { assistant_id: ASSISTANTS.EXCEL }
    );

    // Wait for Excel generation to complete
    console.log('Waiting for Excel generation...');
    const excelResult = await waitForRunCompletion(excelThread.id, excelRun.id, true);
    
    // Get the Excel file content
    console.log('Retrieving Excel file...');
    const fileId = excelResult.file_id;
    const fileContent = await openai.files.retrieveContent(fileId);
    
    // Convert the response to base64
    const buffer = Buffer.from(await fileContent.arrayBuffer());
    const base64Content = buffer.toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename || 'invoice'}.xlsx"`
      },
      body: base64Content,
      isBase64Encoded: true
    };

  } catch (error) {
    console.error('Error processing invoice:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
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
