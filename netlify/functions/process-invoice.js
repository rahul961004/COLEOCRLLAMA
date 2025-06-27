const FormData = require('form-data');
const { LlamaCloud } = require('@llamaindex/cloud');

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

    // Initialize LlamaCloud client
    const client = new LlamaCloud({
      apiKey: process.env.LLAMA_CLOUD_API_KEY,
      baseUrl: 'https://api.llamacloud.ai',
      timeout: 30000
    });

    try {
      console.log('Processing document with LlamaCloud...');
      
      // Submit the document
      const result = await client.parseDocument({
        file: event.body,
        filename: event.headers['x-filename'] || 'invoice.pdf',
        outputFormat: 'markdown'
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
      console.error('LlamaCloud processing error:', error);
      
      // Try with IP fallback if DNS resolution fails
      if (error.code === 'ENOTFOUND') {
        console.log('Trying with IP fallback...');
        
        // Update client with IP address
        client.config.baseUrl = 'https://34.107.221.82';
        client.config.rejectUnauthorized = false;

        try {
          const result = await client.parseDocument({
            file: event.body,
            filename: event.headers['x-filename'] || 'invoice.pdf',
            outputFormat: 'markdown'
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
        } catch (ipError) {
          console.error('IP-based connection failed:', ipError);
          return {
            statusCode: 500,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              status: 'error',
              message: 'Failed to connect to LlamaCloud API',
              error: ipError.message
            })
          };
        }
      } else {
        throw error;
      }
    }
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
        error: error.message,
        stack: error.stack
      })
    };
  }
};
