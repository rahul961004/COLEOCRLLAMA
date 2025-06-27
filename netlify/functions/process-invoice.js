const { LlamaParse } = require('llama-cloud-services');

// Process the invoice using LlamaCloud API
exports.handler = async (event, context) => {
  try {
    console.log('Received request:', event);
    
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

    // Parse multipart form data
    const contentType = event.headers['content-type'];
    if (!contentType || !contentType.startsWith('multipart/form-data')) {
      throw new Error('Invalid content type');
    }

    const boundary = contentType.split('boundary=')[1];
    const body = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body);
    
    // Split parts using boundary
    const parts = body.toString().split(`--${boundary}`);
    
    // Find the file part
    let fileData = null;
    for (let i = 1; i < parts.length - 1; i++) {
      const part = parts[i].trim();
      const headerEnd = part.indexOf('\r\n\r\n');
      if (headerEnd === -1) continue;

      const headers = part.substring(0, headerEnd);
      const content = part.substring(headerEnd + 4);

      // Check if this is the file part
      if (headers.includes('filename="')) {
        const filenameMatch = headers.match(/filename="([^"]+)"/);
        const contentTypeMatch = headers.match(/Content-Type: ([^\r\n]+)/);

        if (filenameMatch && contentTypeMatch) {
          fileData = {
            fileName: filenameMatch[1],
            mimeType: contentTypeMatch[1],
            content: Buffer.from(content)
          };
          break;
        }
      }
    }

    if (!fileData) {
      throw new Error('No file data found in request');
    }

    console.log('File parsed successfully:', {
      fileName: fileData.fileName,
      mimeType: fileData.mimeType,
      size: fileData.content.length
    });

    // Initialize LlamaParse client with EU base URL
    const parser = new LlamaParse({
      apiKey: process.env.LLAMA_CLOUD_API_KEY,
      baseUrl: EU_BASE_URL,
      numWorkers: 1,
      verbose: true
    });

    // Submit the document
    const result = await parser.parse({
      file: fileData.content,
      filename: fileData.fileName,
      resultType: 'markdown'
    });

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'success',
        message: 'Invoice processed successfully',
        data: {
          markdown: result.markdown || '',
          text: result.text || '',
          metadata: result.job_metadata || {}
        }
      })
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
        status: 'error',
        message: 'Error processing invoice',
        error: error.message
      })
    };
  }
};
