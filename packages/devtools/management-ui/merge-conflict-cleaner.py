#!/usr/bin/env python3
"""
Merge Conflict Cleaner Script

This script automatically cleans up merge conflicts by:
1. Removing duplicate imports
2. Keeping the most complete version of duplicated code blocks
3. Ensuring proper syntax after cleanup
4. Preserving functionality while removing conflicts

Focus on these key patterns:
- Import dedupe and consolidation
- Taking the most complete version of components
- Preserving industrial design system elements
- Keeping proper React patterns
"""

import os
import re
import sys
from pathlib import Path
from typing import List, Dict, Set, Tuple
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class MergeConflictCleaner:
    def __init__(self, base_path: str):
        self.base_path = Path(base_path)
        self.files_processed = 0
        self.conflicts_resolved = 0
        self.errors = []
        
    def find_conflict_files(self) -> List[Path]:
        """Find all files with merge conflict markers"""
        conflict_files = []
        
        for file_path in self.base_path.rglob('*.jsx'):
            if self._has_conflicts(file_path):
                conflict_files.append(file_path)
        
        for file_path in self.base_path.rglob('*.js'):
            if self._has_conflicts(file_path):
                conflict_files.append(file_path)
                
        for file_path in self.base_path.rglob('*.css'):
            if self._has_conflicts(file_path):
                conflict_files.append(file_path)
        
        return conflict_files
    
    def _has_conflicts(self, file_path: Path) -> bool:
        """Check if file has merge conflict markers"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
                return any(marker in content for marker in ['<<<<<<<', '=======', '>>>>>>>'])
        except Exception as e:
            logger.error(f"Error reading {file_path}: {e}")
            return False
    
    def clean_file(self, file_path: Path) -> bool:
        """Clean merge conflicts in a single file"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            logger.info(f"Processing {file_path}")
            
            # Parse and resolve conflicts
            cleaned_content = self._resolve_conflicts(content, file_path)
            
            # Write cleaned content back
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(cleaned_content)
            
            self.files_processed += 1
            return True
            
        except Exception as e:
            error_msg = f"Error processing {file_path}: {e}"
            logger.error(error_msg)
            self.errors.append(error_msg)
            return False
    
    def _resolve_conflicts(self, content: str, file_path: Path) -> str:
        """Resolve merge conflicts in content"""
        lines = content.split('\n')
        cleaned_lines = []
        i = 0
        
        while i < len(lines):
            line = lines[i]
            
            # Check for conflict start
            if line.startswith('<<<<<<<'):
                conflict_resolved = self._resolve_conflict_block(lines, i, file_path)
                if conflict_resolved:
                    resolved_lines, skip_count = conflict_resolved
                    cleaned_lines.extend(resolved_lines)
                    i += skip_count
                    self.conflicts_resolved += 1
                else:
                    # If we can't resolve, keep the line as is
                    cleaned_lines.append(line)
                    i += 1
            else:
                cleaned_lines.append(line)
                i += 1
        
        return '\n'.join(cleaned_lines)
    
    def _resolve_conflict_block(self, lines: List[str], start_idx: int, file_path: Path) -> Tuple[List[str], int]:
        """Resolve a single conflict block"""
        # Find the boundaries of the conflict
        head_start = start_idx
        separator_idx = -1
        end_idx = -1
        
        for i in range(start_idx + 1, len(lines)):
            if lines[i].startswith('======='):
                separator_idx = i
            elif lines[i].startswith('>>>>>>>'):
                end_idx = i
                break
        
        if separator_idx == -1 or end_idx == -1:
            logger.warning(f"Malformed conflict block at line {start_idx + 1} in {file_path}")
            return None
        
        # Extract the two versions
        head_version = lines[head_start + 1:separator_idx]
        incoming_version = lines[separator_idx + 1:end_idx]
        
        # Resolve based on file-specific logic
        resolved_lines = self._choose_best_version(head_version, incoming_version, file_path)
        
        # Return resolved lines and number of lines to skip
        return resolved_lines, end_idx - start_idx + 1
    
    def _choose_best_version(self, head_version: List[str], incoming_version: List[str], file_path: Path) -> List[str]:
        """Choose the best version based on content analysis"""
        
        # Handle imports specially
        if self._is_import_block(head_version) or self._is_import_block(incoming_version):
            return self._merge_imports(head_version, incoming_version)
        
        # Handle export statements
        if self._is_export_block(head_version) or self._is_export_block(incoming_version):
            return self._merge_exports(head_version, incoming_version)
        
        # For Layout.jsx and similar component files, prefer the more complete version
        if 'Layout.jsx' in str(file_path):
            return self._resolve_layout_conflicts(head_version, incoming_version)
        
        # For Button.jsx, prefer the shadcn re-export version
        if 'Button.jsx' in str(file_path):
            return self._resolve_button_conflicts(head_version, incoming_version)
        
        # General heuristic: prefer the version with more content
        if len(''.join(head_version).strip()) > len(''.join(incoming_version).strip()):
            return head_version
        else:
            return incoming_version
    
    def _is_import_block(self, lines: List[str]) -> bool:
        """Check if this is an import block"""
        content = ''.join(lines).strip()
        return content.startswith('import') or 'import' in content
    
    def _is_export_block(self, lines: List[str]) -> bool:
        """Check if this is an export block"""
        content = ''.join(lines).strip()
        return content.startswith('export') or 'export' in content
    
    def _merge_imports(self, head_version: List[str], incoming_version: List[str]) -> List[str]:
        """Merge and deduplicate imports"""
        all_imports = set()
        import_lines = []
        
        # Process both versions
        for version in [head_version, incoming_version]:
            for line in version:
                line = line.strip()
                if line and not line.startswith('//'):
                    # Extract import statements
                    if line.startswith('import'):
                        if line not in all_imports:
                            all_imports.add(line)
                            import_lines.append(line)
                    elif 'import' in line and '{' in line:
                        # Handle multi-line imports
                        if line not in all_imports:
                            all_imports.add(line)
                            import_lines.append(line)
        
        # Sort imports for consistency
        import_lines.sort()
        return import_lines
    
    def _merge_exports(self, head_version: List[str], incoming_version: List[str]) -> List[str]:
        """Merge exports, preferring named exports"""
        for version in [head_version, incoming_version]:
            for line in version:
                if 'export {' in line:
                    return version
        
        # If no named exports, prefer the version with more content
        if len(''.join(head_version).strip()) > len(''.join(incoming_version).strip()):
            return head_version
        else:
            return incoming_version
    
    def _resolve_layout_conflicts(self, head_version: List[str], incoming_version: List[str]) -> List[str]:
        """Resolve Layout.jsx specific conflicts"""
        # Look for industrial design elements
        head_content = ''.join(head_version)
        incoming_content = ''.join(incoming_version)
        
        # Prefer version with industrial design elements
        industrial_keywords = ['industrial', 'FriggLogo', 'ThemeToggle', 'RepositoryPicker']
        
        head_score = sum(1 for keyword in industrial_keywords if keyword in head_content)
        incoming_score = sum(1 for keyword in industrial_keywords if keyword in incoming_content)
        
        if head_score > incoming_score:
            return head_version
        elif incoming_score > head_score:
            return incoming_version
        else:
            # If equal, prefer the longer version
            return head_version if len(head_content) > len(incoming_content) else incoming_version
    
    def _resolve_button_conflicts(self, head_version: List[str], incoming_version: List[str]) -> List[str]:
        """Resolve Button.jsx conflicts - prefer shadcn re-export"""
        head_content = ''.join(head_version)
        incoming_content = ''.join(incoming_version)
        
        # Prefer the shadcn re-export version
        if 'ui/button' in head_content:
            return head_version
        elif 'ui/button' in incoming_content:
            return incoming_version
        else:
            # If neither has shadcn, prefer the more complete implementation
            return head_version if len(head_content) > len(incoming_content) else incoming_version
    
    def verify_syntax(self, file_path: Path) -> bool:
        """Basic syntax verification for JS/JSX files"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read()
            
            # Basic checks
            if file_path.suffix in ['.jsx', '.js']:
                # Check for unbalanced braces
                open_braces = content.count('{')
                close_braces = content.count('}')
                if open_braces != close_braces:
                    logger.warning(f"Unbalanced braces in {file_path}")
                    return False
                
                # Check for unbalanced parentheses
                open_parens = content.count('(')
                close_parens = content.count(')')
                if open_parens != close_parens:
                    logger.warning(f"Unbalanced parentheses in {file_path}")
                    return False
                
                # Check for remaining conflict markers
                if any(marker in content for marker in ['<<<<<<<', '=======', '>>>>>>>']):
                    logger.warning(f"Remaining conflict markers in {file_path}")
                    return False
            
            return True
            
        except Exception as e:
            logger.error(f"Error verifying syntax for {file_path}: {e}")
            return False
    
    def run(self) -> Dict[str, any]:
        """Run the merge conflict cleaner"""
        logger.info(f"Starting merge conflict cleanup in {self.base_path}")
        
        # Find all files with conflicts
        conflict_files = self.find_conflict_files()
        
        if not conflict_files:
            logger.info("No merge conflicts found!")
            return {
                'files_processed': 0,
                'conflicts_resolved': 0,
                'errors': [],
                'success': True
            }
        
        logger.info(f"Found {len(conflict_files)} files with merge conflicts")
        
        # Process each file
        successful_files = []
        failed_files = []
        
        for file_path in conflict_files:
            if self.clean_file(file_path):
                if self.verify_syntax(file_path):
                    successful_files.append(file_path)
                    logger.info(f"✓ Successfully cleaned {file_path}")
                else:
                    failed_files.append(file_path)
                    logger.error(f"✗ Syntax issues after cleaning {file_path}")
            else:
                failed_files.append(file_path)
                logger.error(f"✗ Failed to clean {file_path}")
        
        # Summary
        logger.info(f"Cleanup complete!")
        logger.info(f"Files processed: {self.files_processed}")
        logger.info(f"Conflicts resolved: {self.conflicts_resolved}")
        logger.info(f"Successful: {len(successful_files)}")
        logger.info(f"Failed: {len(failed_files)}")
        
        if failed_files:
            logger.error("Failed files:")
            for file_path in failed_files:
                logger.error(f"  - {file_path}")
        
        if self.errors:
            logger.error("Errors encountered:")
            for error in self.errors:
                logger.error(f"  - {error}")
        
        return {
            'files_processed': self.files_processed,
            'conflicts_resolved': self.conflicts_resolved,
            'successful_files': successful_files,
            'failed_files': failed_files,
            'errors': self.errors,
            'success': len(failed_files) == 0
        }

def main():
    """Main entry point"""
    if len(sys.argv) != 2:
        print("Usage: python merge-conflict-cleaner.py <path-to-src-directory>")
        sys.exit(1)
    
    src_path = sys.argv[1]
    
    if not os.path.exists(src_path):
        print(f"Error: Path {src_path} does not exist")
        sys.exit(1)
    
    cleaner = MergeConflictCleaner(src_path)
    result = cleaner.run()
    
    if result['success']:
        print(f"\n✓ All merge conflicts resolved successfully!")
        print(f"   Files processed: {result['files_processed']}")
        print(f"   Conflicts resolved: {result['conflicts_resolved']}")
        sys.exit(0)
    else:
        print(f"\n✗ Some issues occurred during cleanup")
        print(f"   Files processed: {result['files_processed']}")
        print(f"   Conflicts resolved: {result['conflicts_resolved']}")
        print(f"   Errors: {len(result['errors'])}")
        sys.exit(1)

if __name__ == "__main__":
    main()