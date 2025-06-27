import { createReadStream } from 'fs';
import { FormData } from 'form-data';
import { fileURLToPath } from 'url';
import path from 'path';
import fetch from 'node-fetch';

// Process the invoice using LlamaCloud API
export const handler = async (event) => {
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
      return {
        statusCode: 400,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'Invalid content type' })
      };
    }

    // Create temporary file path
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const tempFilePath = path.join(__dirname, 'temp', 'invoice.pdf');

    // Write file to disk
    await new Promise((resolve, reject) => {
      const writeStream = createReadStream(tempFilePath);
      writeStream.write(event.body, 'base64', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Create form data
    const formData = new FormData();
    formData.append('file', createReadStream(tempFilePath), {
      filename: 'invoice.pdf',
      contentType: 'application/pdf'
    });
    formData.append('result_type', 'markdown');

    // Make API request
    const response = await fetch('https://api.llamacloud.ai/v1/parse', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.LLAMA_CLOUD_API_KEY}`,
        ...formData.getHeaders()
      },
      body: formData
    });

    if (!response.ok) {
      const error = await response.text();
      return {
        statusCode: response.status,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error })
      };
    }

    const result = await response.json();
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
