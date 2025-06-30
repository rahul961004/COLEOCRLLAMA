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
  dropArea.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', handleFileSelect, false);
  processBtn.addEventListener('click', processFiles);
  
  // Add paste event listener to the whole document
  document.addEventListener('paste', (e) => {
    // Only handle if the paste is not in an input or textarea
    if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
      handlePaste(e);
    }
  });

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
    handleNewFiles(newFiles);
  }

  function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files);
    handleNewFiles(newFiles);
    // Reset the input to allow selecting the same file again
    e.target.value = '';
  }

  function handlePaste(e) {
    const items = (e.clipboardData || window.clipboardData).items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const blob = item.getAsFile();
        if (blob && (blob.type.startsWith('image/') || blob.type === 'application/pdf')) {
          // Create a new file with a proper name
          const fileName = `pasted-${Date.now()}.${blob.type.split('/')[1] || 'png'}`;
          const file = new File([blob], fileName, { type: blob.type });
          handleNewFiles([file]);
          break;
        }
      }
    }
  }

  function handleNewFiles(newFiles) {
    if (newFiles && newFiles.length > 0) {
      // Filter out non-PDF and non-image files
      const validFiles = newFiles.filter(file => 
        file.type.startsWith('image/') || file.type === 'application/pdf'
      );
      
      if (validFiles.length > 0) {
        files = [...files, ...validFiles];
        updateFileList();
      } else if (newFiles.length > 0) {
        showStatus('Please upload only image or PDF files', 'error');
      }
    }
  }

  function updateFileList() {
    fileList.innerHTML = '';
    files.forEach((file, index) => {
      const fileItem = document.createElement('div');
      fileItem.className = 'file-item';
      
      // Create preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (e) => {
          fileItem.innerHTML = `
            <div class="file-info">
              <img src="${e.target.result}" class="file-preview" alt="Preview">
              <span>${file.name} (${(file.size / 1024).toFixed(2)} KB)</span>
            </div>
            <button class="remove-btn" data-index="${index}">×</button>
          `;
          // Add event listener to the remove button
          fileItem.querySelector('.remove-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            files.splice(index, 1);
            updateFileList();
          });
        };
        reader.readAsDataURL(file);
      } else {
        fileItem.innerHTML = `
          <div class="file-info">
            <span>${file.name} (${(file.size / 1024).toFixed(2)} KB)</span>
          </div>
          <button class="remove-btn" data-index="${index}">×</button>
        `;
        // Add event listener to the remove button
        fileItem.querySelector('.remove-btn').addEventListener('click', (e) => {
          e.stopPropagation();
          files.splice(index, 1);
          updateFileList();
        });
      }
      
      fileList.appendChild(fileItem);
    });

    processBtn.disabled = files.length === 0;
  }

  // Function to convert file to base64
  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      try {
        const reader = new FileReader();
        reader.onload = () => {
          // Remove the data URL prefix (e.g., "data:image/png;base64,")
          const base64Data = reader.result.split(',')[1];
          if (!base64Data) {
            reject(new Error('Failed to convert file to base64'));
            return;
          }
          resolve(base64Data);
        };
        reader.onerror = (error) => {
          console.error('Error reading file:', error);
          reject(new Error('Failed to read file'));
        };
        reader.readAsDataURL(file);
      } catch (error) {
        console.error('Error in fileToBase64:', error);
        reject(error);
      }
    });
  }

  // Function to format the extracted data for display
  function formatExtractedData(data) {
    if (!data) return 'No data extracted';
    
    // If it's an array, process each item
    if (Array.isArray(data)) {
      return data.map(item => formatExtractedData(item)).join('\n\n---\n\n');
    }
    
    // If it's an object, format it nicely
    if (typeof data === 'object') {
      // If it has a 'text' property, use that
      if (data.text) {
        return data.text;
      }
      
      // Otherwise, format the object as JSON
      return Object.entries(data)
        .map(([key, value]) => {
          if (typeof value === 'object') {
            return `<strong>${key}:</strong>\n${JSON.stringify(value, null, 2)}`;
          }
          return `<strong>${key}:</strong> ${value}`;
        })
        .join('\n\n');
    }
    
    // For any other type, convert to string
    return String(data);
  }

  // Function to create a download link for the extracted data
  function createDownloadLink(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename || 'extracted-data'}.json`;
    a.className = 'download-link';
    a.textContent = 'Download as JSON';
    return a;
  }

  // Function to show status messages
  function showStatus(message, type = 'info') {
    statusDiv.textContent = message;
    statusDiv.className = `status-${type}`;
    console.log(`[${type}] ${message}`);
  }

  async function processFiles() {
    if (files.length === 0) {
      showStatus('Please add files to process', 'error');
      return;
    }

    processBtn.disabled = true;
    showStatus('Processing files... This may take a few minutes.', 'info');
    resultDiv.innerHTML = '';

    try {
      // Show loading state
      const loadingIndicator = document.createElement('div');
      loadingIndicator.className = 'loading-indicator';
      loadingIndicator.innerHTML = `
        <div class="spinner"></div>
        <p>Processing ${files.length} file${files.length > 1 ? 's' : ''}...</p>
      `;
      resultDiv.appendChild(loadingIndicator);

      // Convert all files to base64
      showStatus(`Preparing ${files.length} file${files.length > 1 ? 's' : ''} for processing...`, 'info');
      
      const fileProcessingPromises = files.map(async (file, index) => {
        try {
          showStatus(`Processing file ${index + 1} of ${files.length}: ${file.name}`, 'info');
          const base64Data = await fileToBase64(file);
          return {
            name: file.name,
            type: file.type,
            data: base64Data
          };
        } catch (error) {
          console.error(`Error processing file ${file.name}:`, error);
          return {
            name: file.name,
            error: `Failed to process file: ${error.message}`
          };
        }
      });

      const fileData = await Promise.all(fileProcessingPromises);
      
      // Check if any files failed to process
      const failedFiles = fileData.filter(file => file.error);
      if (failedFiles.length > 0) {
        console.error('Some files failed to process:', failedFiles);
        showStatus(`${failedFiles.length} file${failedFiles.length > 1 ? 's' : ''} failed to process`, 'warning');
      }
      
      // Remove loading indicator
      resultDiv.innerHTML = '';
      
      // Send to server for processing
      showStatus('Sending files to server for processing...', 'info');
      
      const response = await fetch('/.netlify/functions/process-invoice', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          files: fileData.filter(file => !file.error) // Only send successfully processed files
        })
      });

      if (!response.ok) {
        let errorMsg = 'Failed to process files';
        try {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.message || errorMsg;
          if (errorData.details) {
            errorMsg += `\nDetails: ${JSON.stringify(errorData.details, null, 2)}`;
          }
        } catch (e) {
          errorMsg = `Server error: ${response.status} ${response.statusText}`;
        }
        throw new Error(errorMsg);
      }

      // Handle the response as JSON
      const result = await response.json();
      
      // Display the result in a readable format
      if (result.data) {
        // Clear previous results
        resultDiv.innerHTML = '';
        
        // Add a section for each processed file
        result.data.forEach((fileResult, index) => {
          const fileSection = document.createElement('div');
          fileSection.className = 'result-section';
          
          const fileName = files[index]?.name || `File ${index + 1}`;
          const header = document.createElement('h3');
          header.textContent = `Results for: ${fileName}`;
          fileSection.appendChild(header);
          
          if (fileResult.error) {
            const errorDiv = document.createElement('div');
            errorDiv.className = 'error-message';
            errorDiv.textContent = `Error: ${fileResult.error}`;
            fileSection.appendChild(errorDiv);
          } else {
            const contentDiv = document.createElement('div');
            contentDiv.className = 'result-content';
            
            // Format the extracted data
            const formattedData = formatExtractedData(fileResult);
            
            // Use innerHTML for formatted content
            contentDiv.innerHTML = `<pre>${formattedData}</pre>`;
            
            // Add download link
            const downloadLink = createDownloadLink(fileResult, `extracted-${fileName.replace(/\.[^/.]+$/, '')}`);
            contentDiv.appendChild(document.createElement('br'));
            contentDiv.appendChild(downloadLink);
            
            fileSection.appendChild(contentDiv);
          }
          
          resultDiv.appendChild(fileSection);
        });
        
        showStatus('Processing complete!', 'success');
      } else {
        showStatus('Processing complete, but no data was returned.', 'warning');
      }
      
    } catch (error) {
      console.error('Error processing files:', error);
      showStatus(`Error: ${error.message || 'Failed to process files. Please try again.'}`, 'error');
    } finally {
      processBtn.disabled = false;
    }
  }
});
