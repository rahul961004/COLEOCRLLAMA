import FormData from 'form-data-node';
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

    // Parse multipart form data
    const formData = new FormData();
    
    // Create a Buffer from the base64 encoded body
    const fileBuffer = Buffer.from(event.body, 'base64');
    
    // Add the file to form data
    formData.append('file', fileBuffer, {
      filename: 'invoice.pdf',
      contentType: 'application/pdf'
    });
    
    // Add result type
    formData.append('result_type', 'markdown');
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
