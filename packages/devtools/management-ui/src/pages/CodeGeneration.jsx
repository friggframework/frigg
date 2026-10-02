import React from 'react';
import { CodeGenerationWizard } from '../components/codegen';

const CodeGeneration = () => {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="py-8">
        <CodeGenerationWizard />
      </div>
    </div>
  );
};

export default CodeGeneration;