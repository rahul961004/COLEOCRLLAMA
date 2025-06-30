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
  document.addEventListener('paste', handlePaste);

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
    addFiles(newFiles);
  }

  function handleFileSelect(e) {
    const newFiles = Array.from(e.target.files);
    addFiles(newFiles);
  }

  function handlePaste(e) {
    const items = (e.clipboardData || window.clipboardData).items;
    if (!items) return;

    for (const item of items) {
      if (item.kind === 'file') {
        const blob = item.getAsFile();
        if (blob && blob.type.startsWith('image/')) {
          addFiles([blob]);
          break;
        }
      }
    }
  }

  function addFiles(newFiles) {
    if (newFiles.length > 0) {
      files = [...files, ...newFiles];
      updateFileList();
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

  async function processFiles() {
    if (files.length === 0) return;

    processBtn.disabled = true;
    statusDiv.textContent = 'Processing...';
    resultDiv.innerHTML = '';

    try {
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('filename', file.name);
        formData.append('contentType', file.type);

        const response = await fetch('/.netlify/functions/process-invoice', {
          method: 'POST',
          body: formData
        });

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `processed_${file.name.replace(/\.[^/.]+$/, '')}.xlsx`;
        a.textContent = `Download ${file.name}`;
        a.className = 'download-link';
        
        resultDiv.appendChild(document.createElement('br'));
        resultDiv.appendChild(a);
      }
      
      statusDiv.textContent = 'Processing complete!';
    } catch (error) {
      console.error('Error:', error);
      statusDiv.textContent = `Error: ${error.message}`;
    } finally {
      processBtn.disabled = false;
    }
  }
});
