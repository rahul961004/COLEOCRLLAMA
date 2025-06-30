document.addEventListener('DOMContentLoaded', () => {
  const dropArea = document.getElementById('drop-area');
  const fileInput = document.getElementById('file-input');
  const fileList = document.getElementById('file-list');
  const processBtn = document.getElementById('process-btn');
  const statusDiv = document.getElementById('status');
  const resultDiv = document.getElementById('result');

  let files = [];

  // Prevent default drag behaviors
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, preventDefaults, false);
    document.body.addEventListener(eventName, preventDefaults, false);
  });

  // Highlight drop area when item is dragged over it
  ['dragenter', 'dragover'].forEach(eventName => {
    dropArea.addEventListener(eventName, highlight, false);
  });
  
  ['dragleave', 'drop'].forEach(eventName => {
    dropArea.addEventListener(eventName, unhighlight, false);
  });

  // Handle dropped files
  dropArea.addEventListener('drop', handleDrop, false);
  fileInput.addEventListener('change', handleFiles, false);
  processBtn.addEventListener('click', processFiles);

  function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
  }

  function highlight() {
    dropArea.classList.add('highlight');
  }

  function unhighlight() {
    dropArea.classList.remove('highlight');
  }

  function handleDrop(e) {
    const dt = e.dataTransfer;
    const newFiles = Array.from(dt.files);
    handleFiles({ target: { files: newFiles } });
  }

  function handleFiles(e) {
    const newFiles = Array.from(e.target.files);
    files = [...files, ...newFiles];
    updateFileList();
  }

  function updateFileList() {
    fileList.innerHTML = '';
    files.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      fileItem.innerHTML = `
        <span>${file.name}</span>
        <button class="remove-btn" data-index="${index}">×</button>
      `;
      fileList.appendChild(fileItem);
    });

    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        files.splice(index, 1);
        updateFileList();
      });
    });

    processBtn.disabled = files.length === 0;
  }

  async function processFiles() {
    if (files.length === 0) return;

    // Show loading state
    processBtn.disabled = true;
    statusDiv.textContent = 'Processing...';
    resultDiv.innerHTML = '';

    try {
      // Process each file sequentially
      for (const file of files) {
        await processFile(file);
      }
      
      statusDiv.textContent = 'Processing complete!';
    } catch (error) {
      console.error('Error processing files:', error);
      statusDiv.textContent = `Error: ${error.message}`;
    } finally {
      processBtn.disabled = false;
    }
  }

  async function processFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      
      reader.onload = async (e) => {
        try {
          // Convert file to base64
          const base64Data = e.target.result.split(',')[1];
          
          // Upload file to OpenAI
          const uploadResponse = await fetch('https://api.openai.com/v1/files', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              file: base64Data,
              purpose: 'assistants'
            })
          });

          if (!uploadResponse.ok) {
            throw new Error('Failed to upload file to OpenAI');
          }

          const { id: fileId } = await uploadResponse.json();
          
          // Process with our Netlify function
          const response = await fetch('/.netlify/functions/process-invoice', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              file: fileId,
              filename: file.name,
              contentType: file.type
            })
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to process file');
          }

          // Handle Excel file response
          const blob = await response.blob();
          const url = window.URL.createObjectURL(blob);
          
          // Create download link
          const a = document.createElement('a');
          a.href = url;
          a.download = `processed_${file.name.replace(/\.[^/.]+$/, '')}.xlsx`;
          a.textContent = `Download ${file.name}`;
          a.className = 'download-link';
          
          resultDiv.appendChild(document.createElement('br'));
          resultDiv.appendChild(a);
          
          resolve();
        } catch (error) {
          reject(error);
        }
      };
      
      reader.onerror = () => {
        reject(new Error('Error reading file'));
      };
      
      reader.readAsDataURL(file);
    });
  }
});
