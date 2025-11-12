# IDE Settings Test Suite

## Overview

This comprehensive test suite validates the complete IDE settings implementation for the Frigg Management UI, covering theme switching, IDE selection, security validations, and user workflows.

## Test Structure

```
src/tests/
├── setup.js                    # Test environment configuration
├── utils/
│   └── testHelpers.js          # Shared test utilities
├── mocks/
│   └── ideApi.js              # API response mocks and test data
├── components/
│   ├── ThemeProvider.test.jsx  # Theme switching and persistence
│   ├── IDESelector.test.jsx    # IDE selection and custom commands
│   ├── SettingsModal.test.jsx  # Settings modal navigation
│   └── OpenInIDEButton.test.jsx # File opening functionality
├── hooks/
│   └── useIDE.test.js          # IDE hook behavior
├── security/
│   └── security.test.js        # Security validations
├── integration/
│   └── complete-workflow.test.jsx # End-to-end workflows
├── edge-cases/
│   └── browser-compatibility.test.js # Cross-browser testing
└── test-runner.js              # Test orchestration and reporting
```

## Test Categories

### 1. Component Tests
- **ThemeProvider**: Theme switching, localStorage persistence, system theme detection
- **IDESelector**: IDE selection, custom commands, categorization, refresh functionality
- **SettingsModal**: Modal behavior, tab navigation, form validation
- **OpenInIDEButton**: File opening, error handling, status transitions

### 2. Hook Tests
- **useIDE**: IDE management, availability detection, file opening, caching

### 3. Security Tests
- Path traversal prevention
- Command injection protection
- XSS prevention
- Input validation
- CSRF protection
- Rate limiting

### 4. Integration Tests
- Complete user workflows
- Cross-component state management
- Error recovery scenarios
- Performance optimization

### 5. Edge Cases & Browser Compatibility
- Legacy browser support
- Device viewport compatibility
- Network edge cases
- Performance edge cases
- Accessibility compliance

## Running Tests

### Quick Commands

```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test suite
npm run test -- src/tests/components/

# Run in watch mode
npm run test:watch

# Run with UI
npm run test:ui
```

### Advanced Test Runner

```bash
# Run comprehensive test suite with reporting
node src/tests/test-runner.js all

# Run specific categories
node src/tests/test-runner.js security
node src/tests/test-runner.js performance

# Generate detailed report
node src/tests/test-runner.js report
```

## Coverage Thresholds

| Metric | Global | ThemeProvider | useIDE | IDESelector |
|--------|--------|---------------|--------|-------------|
| Lines | 80% | 90% | 85% | 80% |
| Functions | 80% | 90% | 85% | 80% |
| Branches | 75% | 85% | 80% | 75% |
| Statements | 80% | 90% | 85% | 80% |

## Test Features

### Comprehensive Mocking
- API responses with realistic data
- Browser environment simulation
- LocalStorage and system preferences
- Network conditions and errors

### Security Testing
- 50+ security test payloads
- Path traversal prevention
- Command injection protection
- XSS and CSRF validation

### Performance Monitoring
- Render time tracking
- Memory usage analysis
- Slow test identification
- Resource leak detection

### Accessibility Testing
- Screen reader compatibility
- Keyboard navigation
- Focus management
- High contrast mode

### Cross-Browser Support
- Mobile viewport testing
- Legacy browser compatibility
- Touch interaction support
- Reduced motion preferences

## Key Test Scenarios

### First-Time User Setup
1. User opens settings for first time
2. Selects theme preference (light/dark/system)
3. Chooses IDE from available options
4. Saves preferences to localStorage
5. Preferences persist across sessions

### Custom IDE Configuration
1. User selects "Custom Command" option
2. Enters custom IDE command with validation
3. Real-time feedback on command format
4. Security validation for dangerous commands
5. Save and test custom configuration

### Error Recovery
1. IDE detection fails (network/API error)
2. User sees helpful error message
3. Refresh functionality works
4. Fallback to custom command option
5. Graceful degradation without crashes

### Security Validation
1. Path traversal attempts blocked
2. Command injection prevented
3. XSS attacks sanitized
4. Rate limiting enforced
5. Session security maintained

## Test Utilities

### Helper Functions
- `renderWithTheme()` - Render components with theme context
- `userInteraction.click/type()` - Simulate user actions
- `waitForAPICall()` - Wait for async operations
- `testModal.expectOpen/Closed()` - Modal state validation
- `securityTest.xssPayloads` - Security test data

### Mock Data
- Complete IDE list with availability status
- Realistic API responses
- Security test payloads
- Browser compatibility scenarios

## Reporting

### HTML Report
Generated comprehensive HTML report includes:
- Coverage visualization with color-coded metrics
- Performance analysis with slow test identification
- Security vulnerability summary
- Test execution timeline
- Recommendations for improvements

### Console Output
- Real-time test progress
- Coverage summary
- Performance metrics
- Security scan results
- Quality gate status

## Quality Gates

Tests must pass these quality gates:
- ✅ Coverage ≥ 80% across all metrics
- ✅ Performance ≤ 30s total test time
- ✅ Security: 0 vulnerabilities
- ✅ All integration workflows pass
- ✅ Cross-browser compatibility verified

## Troubleshooting

### Common Issues

**Test Timeouts**
- Check network mocks are properly configured
- Verify async operations use proper waiting
- Ensure cleanup in afterEach hooks

**Coverage Gaps**
- Review untested code paths
- Add edge case scenarios
- Test error handling paths

**Flaky Tests**
- Use proper async/await patterns
- Mock time-dependent operations
- Clean up side effects between tests

### Debug Tips

```bash
# Run single test file
npm run test -- --run src/tests/components/ThemeProvider.test.jsx

# Enable verbose output
npm run test -- --reporter=verbose

# Run with debugger
npm run test -- --inspect-brk

# Check memory usage
npm run test -- --logHeapUsage
```

## Contributing

When adding new features to IDE settings:

1. **Write tests first** (TDD approach)
2. **Update existing tests** for behavior changes
3. **Add security tests** for new input handling
4. **Test cross-browser compatibility**
5. **Update coverage thresholds** if needed
6. **Run full test suite** before committing

## Continuous Integration

This test suite integrates with CI/CD:
- Automated test execution on PR
- Coverage reporting to PR comments
- Security scan integration
- Performance regression detection
- Cross-browser testing matrix

## Resources

- [Vitest Documentation](https://vitest.dev/)
- [Testing Library Guides](https://testing-library.com/)
- [React Testing Best Practices](https://kentcdodds.com/blog/common-mistakes-with-react-testing-library)
- [Security Testing Guidelines](https://owasp.org/www-project-web-security-testing-guide/)

---

*This test suite ensures the IDE settings implementation is robust, secure, and user-friendly across all scenarios.*