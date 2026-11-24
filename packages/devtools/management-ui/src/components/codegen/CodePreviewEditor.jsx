import React, { useState, useCallback, useMemo } from 'react';
import { Card } from '../Card';
import { Button } from '../Button';

const CodePreviewEditor = ({ code, metadata, onChange }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [editableCode, setEditableCode] = useState({});
  const [showPreview, setShowPreview] = useState(true);

  // Extract files from metadata or code
  const files = useMemo(() => {
    if (metadata?.files) {
      return metadata.files;
    }
    
    // If no files in metadata, create a single file from code
    if (typeof code === 'string') {
      return [{ name: 'index.js', content: code }];
    }
    
    // If code is an object with multiple files
    if (typeof code === 'object' && code !== null) {
      return Object.entries(code).map(([name, content]) => ({
        name: name.endsWith('.js') ? name : `${name}.js`,
        content: typeof content === 'string' ? content : JSON.stringify(content, null, 2)
      }));
    }
    
    return [];
  }, [code, metadata]);

  // Initialize selected file
  React.useEffect(() => {
    if (files.length > 0 && !selectedFile) {
      setSelectedFile(files[0].name);
    }
  }, [files, selectedFile]);

  const handleCodeChange = useCallback((fileName, newContent) => {
    setEditableCode(prev => ({
      ...prev,
      [fileName]: newContent
    }));
    
    // Notify parent component of changes
    if (onChange) {
      const updatedFiles = files.map(file => 
        file.name === fileName 
          ? { ...file, content: newContent }
          : file
      );
      onChange(updatedFiles);
    }
  }, [files, onChange]);

  const getCurrentContent = useCallback((fileName) => {
    return editableCode[fileName] ?? files.find(f => f.name === fileName)?.content ?? '';
  }, [editableCode, files]);

  const getFileIcon = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
        return '📄';
      case 'json':
        return '📋';
      case 'md':
        return '📝';
      case 'yml':
      case 'yaml':
        return '⚙️';
      case 'env':
        return '🔐';
      default:
        return '📄';
    }
  };

  const getLanguage = (fileName) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'js':
        return 'javascript';
      case 'json':
        return 'json';
      case 'md':
        return 'markdown';
      case 'yml':
      case 'yaml':
        return 'yaml';
      case 'env':
        return 'bash';
      default:
        return 'text';
    }
  };

  const formatCode = (content, language) => {
    // Simple syntax highlighting for demonstration
    // In a real implementation, you'd use a proper syntax highlighter like Prism.js
    if (language === 'javascript') {
      return content
        .replace(/(\/\/.*$)/gm, '<span style="color: #008000;">$1</span>')
        .replace(/(\/\*[\s\S]*?\*\/)/g, '<span style="color: #008000;">$1</span>')
        .replace(/\b(const|let|var|function|class|if|else|for|while|return|import|export|require|module)\b/g, '<span style="color: #0000FF;">$1</span>')
        .replace(/(['"`])((?:(?!\1)[^\\]|\\.)*)(\1)/g, '<span style="color: #A31515;">$1$2$3</span>');
    }
    return content;
  };

  const downloadFile = (fileName) => {
    const content = getCurrentContent(fileName);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadAll = () => {
    const zip = files.map(file => ({
      name: file.name,
      content: getCurrentContent(file.name)
    }));
    
    // In a real implementation, you'd use a library like JSZip
    const contents = zip.map(file => `// File: ${file.name}\n${file.content}`).join('\n\n' + '='.repeat(50) + '\n\n');
    const blob = new Blob([contents], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${metadata?.name || 'generated-code'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (files.length === 0) {
    return (
      <Card className="p-8">
        <div className="text-center text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p>No code generated yet</p>
          <p className="text-sm mt-1">Configure your settings and generate code to see a preview</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Code Preview & Editor</h3>
        <div className="flex space-x-2">
          <div className="flex border rounded-md">
            <button
              onClick={() => setShowPreview(true)}
              className={`px-3 py-1 text-sm ${showPreview ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Preview
            </button>
            <button
              onClick={() => setShowPreview(false)}
              className={`px-3 py-1 text-sm ${!showPreview ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
            >
              Edit
            </button>
          </div>
          <Button onClick={downloadAll} size="sm">
            Download All
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* File Explorer */}
        <div className="lg:col-span-1">
          <Card className="p-4">
            <h4 className="font-medium mb-3">Files ({files.length})</h4>
            <div className="space-y-1">
              {files.map((file) => (
                <div
                  key={file.name}
                  onClick={() => setSelectedFile(file.name)}
                  className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                    selectedFile === file.name
                      ? 'bg-blue-100 text-blue-800'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center">
                    <span className="mr-2">{getFileIcon(file.name)}</span>
                    <span className="text-sm truncate">{file.name}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      downloadFile(file.name);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                    title="Download file"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Code Display */}
        <div className="lg:col-span-3">
          {selectedFile && (
            <Card className="p-0 overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 border-b flex justify-between items-center">
                <div className="flex items-center">
                  <span className="mr-2">{getFileIcon(selectedFile)}</span>
                  <span className="font-medium">{selectedFile}</span>
                  <span className="ml-2 text-sm text-gray-500">
                    ({getLanguage(selectedFile)})
                  </span>
                </div>
                <div className="text-sm text-gray-500">
                  {getCurrentContent(selectedFile).split('\n').length} lines
                </div>
              </div>
              
              <div className="p-0">
                {showPreview ? (
                  <pre className="p-4 bg-gray-900 text-gray-100 overflow-x-auto text-sm">
                    <code
                      dangerouslySetInnerHTML={{
                        __html: formatCode(getCurrentContent(selectedFile), getLanguage(selectedFile))
                      }}
                    />
                  </pre>
                ) : (
                  <textarea
                    value={getCurrentContent(selectedFile)}
                    onChange={(e) => handleCodeChange(selectedFile, e.target.value)}
                    className="w-full h-96 p-4 font-mono text-sm border-0 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                    style={{ tabSize: 2 }}
                  />
                )}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* File Stats */}
      <Card className="p-4">
        <h4 className="font-medium mb-2">Generation Summary</h4>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-bold text-blue-600">{files.length}</div>
            <div className="text-sm text-gray-500">Files</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-green-600">
              {files.reduce((total, file) => total + getCurrentContent(file.name).split('\n').length, 0)}
            </div>
            <div className="text-sm text-gray-500">Lines</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-purple-600">
              {Math.round(files.reduce((total, file) => total + getCurrentContent(file.name).length, 0) / 1024)}K
            </div>
            <div className="text-sm text-gray-500">Characters</div>
          </div>
          <div>
            <div className="text-2xl font-bold text-orange-600">
              {metadata?.type || 'Generated'}
            </div>
            <div className="text-sm text-gray-500">Type</div>
          </div>
        </div>
      </Card>

      {/* Validation Messages */}
      {metadata?.validationErrors && metadata.validationErrors.length > 0 && (
        <Card className="p-4 border-red-200 bg-red-50">
          <h4 className="font-medium text-red-800 mb-2">Validation Errors</h4>
          <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
            {metadata.validationErrors.map((error, index) => (
              <li key={index}>{error}</li>
            ))}
          </ul>
        </Card>
      )}

      {/* Tips */}
      <Card className="p-4 bg-blue-50 border-blue-200">
        <h4 className="font-medium text-blue-800 mb-2">💡 Tips</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• Switch between Preview and Edit modes to review or modify generated code</li>
          <li>• Download individual files or all files as a bundle</li>
          <li>• Changes made in edit mode will be included in the final generation</li>
          <li>• Use the file explorer to navigate between generated files</li>
        </ul>
      </Card>
    </div>
  );
};

export default CodePreviewEditor;