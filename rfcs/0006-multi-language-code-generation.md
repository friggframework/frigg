# RFC: Multi-Language Code Generation

**RFC Number**: 0006  
**Title**: Implement Multi-Language Code Generation for Frigg Framework  
**Status**: Draft  
**Created**: 2025-07-01  
**Author**: Claude Code with SAFLA  
**Dependencies**: RFC 0002 (Domain Layer), RFC 0003 (Repository Pattern), RFC 0004 (Application Services), RFC 0005 (Infrastructure Adapters)  
**Related**: None

## Summary

This RFC proposes implementing a multi-language code generation system that allows Frigg applications to be generated in various programming languages while maintaining architectural consistency. This realizes the vision of Frigg as an architecture-first framework rather than language-specific tooling.

## Motivation

Current Frigg Framework is JavaScript/TypeScript specific, limiting adoption and flexibility:

1. **Language lock-in** - Teams using other languages cannot adopt Frigg
2. **Limited ecosystem** - Cannot leverage language-specific libraries and tools
3. **Performance constraints** - Some use cases require different language performance characteristics
4. **Team preferences** - Organizations have existing language expertise and preferences
5. **Platform requirements** - Some deployment targets favor specific languages

## Detailed Design

### Code Generation Architecture

```
packages/core/src/codegen/
├── templates/
│   ├── typescript/
│   │   ├── domain/
│   │   │   ├── entity.hbs
│   │   │   ├── value-object.hbs
│   │   │   └── repository.hbs
│   │   ├── application/
│   │   │   ├── service.hbs
│   │   │   └── command.hbs
│   │   └── infrastructure/
│   │       ├── adapter.hbs
│   │       └── config.hbs
│   ├── python/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── go/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   ├── java/
│   │   ├── domain/
│   │   ├── application/
│   │   └── infrastructure/
│   └── csharp/
│       ├── domain/
│       ├── application/
│       └── infrastructure/
├── generators/
│   ├── TypeScriptGenerator.ts
│   ├── PythonGenerator.ts
│   ├── GoGenerator.ts
│   ├── JavaGenerator.ts
│   └── CSharpGenerator.ts
├── models/
│   ├── GenerationContext.ts
│   ├── LanguageModel.ts
│   └── TemplateModel.ts
├── analyzers/
│   ├── DependencyAnalyzer.ts
│   ├── ArchitectureValidator.ts
│   └── CompatibilityChecker.ts
└── formatters/
    ├── TypeScriptFormatter.ts
    ├── PythonFormatter.ts
    └── GoFormatter.ts
```

### Generation Context Model

```typescript
export interface GenerationContext {
  app: FriggAppDefinition;
  targetLanguage: Language;
  targetFramework?: Framework;
  architecture: ArchitecturePattern;
  integrations: IntegrationDefinition[];
  modules: ApiModuleDefinition[];
  extensions: ExtensionDefinition[];
  outputPath: string;
  options: GenerationOptions;
}

export interface GenerationOptions {
  includeTests: boolean;
  includeDocs: boolean;
  useContainerization: boolean;
  deploymentTarget: DeploymentTarget;
  packageManager: PackageManager;
  buildTool: BuildTool;
  formatting: FormattingOptions;
}

export enum Language {
  TYPESCRIPT = 'typescript',
  PYTHON = 'python',
  GO = 'go',
  JAVA = 'java',
  CSHARP = 'csharp',
  RUST = 'rust'
}

export enum Framework {
  // TypeScript/JavaScript
  EXPRESS = 'express',
  FASTIFY = 'fastify',
  NEST = 'nest',
  
  // Python
  FASTAPI = 'fastapi',
  DJANGO = 'django',
  FLASK = 'flask',
  
  // Go
  GIN = 'gin',
  ECHO = 'echo',
  FIBER = 'fiber',
  
  // Java
  SPRING_BOOT = 'spring-boot',
  QUARKUS = 'quarkus',
  MICRONAUT = 'micronaut',
  
  // C#
  DOTNET_CORE = 'dotnet-core',
  ASPNET_CORE = 'aspnet-core'
}
```

### Language-Specific Models

```typescript
export interface LanguageModel {
  language: Language;
  conventions: NamingConventions;
  types: TypeMapping;
  patterns: LanguagePatterns;
  dependencies: DependencyManagement;
  testing: TestingFramework;
}

export interface TypeMapping {
  string: string;
  number: string;
  boolean: string;
  date: string;
  uuid: string;
  array: (elementType: string) => string;
  map: (keyType: string, valueType: string) => string;
  optional: (type: string) => string;
}

export interface NamingConventions {
  class: (name: string) => string;      // PascalCase, UpperCamelCase
  method: (name: string) => string;     // camelCase, snake_case
  variable: (name: string) => string;   // camelCase, snake_case
  constant: (name: string) => string;   // UPPER_SNAKE_CASE
  file: (name: string) => string;       // kebab-case, snake_case
  package: (name: string) => string;    // lowercase, snake_case
}

// Language-specific models
export const TypeScriptModel: LanguageModel = {
  language: Language.TYPESCRIPT,
  conventions: {
    class: (name) => toPascalCase(name),
    method: (name) => toCamelCase(name),
    variable: (name) => toCamelCase(name),
    constant: (name) => toUpperSnakeCase(name),
    file: (name) => toKebabCase(name),
    package: (name) => toKebabCase(name)
  },
  types: {
    string: 'string',
    number: 'number',
    boolean: 'boolean',
    date: 'Date',
    uuid: 'string',
    array: (type) => `${type}[]`,
    map: (key, value) => `Map<${key}, ${value}>`,
    optional: (type) => `${type} | null`
  },
  patterns: {
    dependency_injection: 'constructor_injection',
    async_pattern: 'promise',
    error_handling: 'try_catch'
  },
  dependencies: {
    manager: 'npm',
    testFramework: 'jest',
    buildTool: 'tsc'
  },
  testing: {
    framework: 'jest',
    mocking: 'jest.mock',
    assertions: 'expect'
  }
};

export const PythonModel: LanguageModel = {
  language: Language.PYTHON,
  conventions: {
    class: (name) => toPascalCase(name),
    method: (name) => toSnakeCase(name),
    variable: (name) => toSnakeCase(name),
    constant: (name) => toUpperSnakeCase(name),
    file: (name) => toSnakeCase(name),
    package: (name) => toSnakeCase(name)
  },
  types: {
    string: 'str',
    number: 'float',
    boolean: 'bool',
    date: 'datetime',
    uuid: 'UUID',
    array: (type) => `List[${type}]`,
    map: (key, value) => `Dict[${key}, ${value}]`,
    optional: (type) => `Optional[${type}]`
  },
  patterns: {
    dependency_injection: 'dependency_injector',
    async_pattern: 'asyncio',
    error_handling: 'try_except'
  },
  dependencies: {
    manager: 'pip',
    testFramework: 'pytest',
    buildTool: 'setup.py'
  },
  testing: {
    framework: 'pytest',
    mocking: 'unittest.mock',
    assertions: 'assert'
  }
};
```

### Template System

#### Base Template Structure
```typescript
export interface Template {
  name: string;
  language: Language;
  category: TemplateCategory;
  content: string;
  partials: Record<string, string>;
  helpers: Record<string, Function>;
  metadata: TemplateMetadata;
}

export enum TemplateCategory {
  DOMAIN_ENTITY = 'domain/entity',
  DOMAIN_VALUE_OBJECT = 'domain/value-object',
  DOMAIN_SERVICE = 'domain/service',
  APPLICATION_SERVICE = 'application/service',
  APPLICATION_COMMAND = 'application/command',
  INFRASTRUCTURE_REPOSITORY = 'infrastructure/repository',
  INFRASTRUCTURE_ADAPTER = 'infrastructure/adapter',
  CONFIGURATION = 'configuration',
  TESTS = 'tests',
  DEPLOYMENT = 'deployment'
}

export interface TemplateMetadata {
  version: string;
  dependencies: string[];
  requiredHelpers: string[];
  outputPattern: string;
}
```

#### TypeScript Templates (Handlebars)
```handlebars
{{! domain/entity.hbs }}
{{>imports}}

export class {{pascalCase name}}{{#if extends}} extends {{pascalCase extends}}{{/if}} {
  {{#each properties}}
  private {{camelCase name}}: {{tsType type}};
  {{/each}}

  private constructor(
    {{#if extends}}...baseArgs: any[],{{/if}}
    {{#each properties}}
    {{camelCase name}}: {{tsType type}}{{#unless @last}},{{/unless}}
    {{/each}}
  ) {
    {{#if extends}}super(...baseArgs);{{/if}}
    {{#each properties}}
    this.{{camelCase name}} = {{camelCase name}};
    {{/each}}
  }

  static create(
    {{#each staticFactoryParams}}
    {{camelCase name}}: {{tsType type}}{{#unless @last}},{{/unless}}
    {{/each}}
  ): {{pascalCase ../name}} {
    {{#each validations}}
    {{>validation this}}
    {{/each}}
    
    return new {{pascalCase ../name}}(
      {{#each staticFactoryParams}}
      {{camelCase name}}{{#unless @last}},{{/unless}}
      {{/each}}
    );
  }

  {{#each methods}}
  {{>method this}}
  {{/each}}

  {{#each properties}}
  get{{pascalCase name}}(): {{tsType type}} {
    return this.{{camelCase name}};
  }
  {{/each}}
}
```

#### Python Templates (Jinja2)
```python
{# domain/entity.py.j2 #}
{% include 'imports.py.j2' %}

class {{ name | pascal_case }}{% if extends %}({{ extends | pascal_case }}){% endif %}:
    {% for property in properties %}
    _{{ property.name | snake_case }}: {{ property.type | python_type }}
    {% endfor %}

    def __init__(
        self,
        {% if extends %}*args, **kwargs,{% endif %}
        {% for property in properties %}
        {{ property.name | snake_case }}: {{ property.type | python_type }}{{ ',' if not loop.last }}
        {% endfor %}
    ):
        {% if extends %}super().__init__(*args, **kwargs){% endif %}
        {% for property in properties %}
        self._{{ property.name | snake_case }} = {{ property.name | snake_case }}
        {% endfor %}

    @classmethod
    def create(
        cls,
        {% for param in static_factory_params %}
        {{ param.name | snake_case }}: {{ param.type | python_type }}{{ ',' if not loop.last }}
        {% endfor %}
    ) -> '{{ name | pascal_case }}':
        {% for validation in validations %}
        {% include 'validation.py.j2' %}
        {% endfor %}
        
        return cls(
            {% for param in static_factory_params %}
            {{ param.name | snake_case }}={{ param.name | snake_case }}{{ ',' if not loop.last }}
            {% endfor %}
        )

    {% for method in methods %}
    {% include 'method.py.j2' %}
    {% endfor %}

    {% for property in properties %}
    @property
    def {{ property.name | snake_case }}(self) -> {{ property.type | python_type }}:
        return self._{{ property.name | snake_case }}
    {% endfor %}
```

### Code Generators

#### Base Generator
```typescript
export abstract class CodeGenerator {
  protected constructor(
    protected language: Language,
    protected templateEngine: TemplateEngine,
    protected languageModel: LanguageModel
  ) {}

  abstract generateApp(context: GenerationContext): Promise<GeneratedProject>;
  abstract generateIntegration(integration: IntegrationDefinition, context: GenerationContext): Promise<GeneratedCode>;
  abstract generateModule(module: ApiModuleDefinition, context: GenerationContext): Promise<GeneratedCode>;

  protected async renderTemplate(
    templateName: string,
    data: any,
    options?: RenderOptions
  ): Promise<string> {
    const template = await this.templateEngine.getTemplate(templateName, this.language);
    return this.templateEngine.render(template, {
      ...data,
      language: this.languageModel,
      helpers: this.getHelpers()
    });
  }

  protected getHelpers(): Record<string, Function> {
    return {
      pascalCase: (str: string) => this.languageModel.conventions.class(str),
      camelCase: (str: string) => this.languageModel.conventions.method(str),
      snakeCase: (str: string) => this.languageModel.conventions.variable(str),
      typeMapping: (type: string) => this.mapType(type),
      ...this.getLanguageSpecificHelpers()
    };
  }

  protected abstract getLanguageSpecificHelpers(): Record<string, Function>;
  protected abstract mapType(type: string): string;
}
```

#### TypeScript Generator
```typescript
export class TypeScriptGenerator extends CodeGenerator {
  constructor() {
    super(Language.TYPESCRIPT, new HandlebarsEngine(), TypeScriptModel);
  }

  async generateApp(context: GenerationContext): Promise<GeneratedProject> {
    const project = new GeneratedProject(context.outputPath);

    // Generate package.json
    const packageJson = await this.generatePackageJson(context);
    project.addFile('package.json', packageJson);

    // Generate tsconfig.json
    const tsConfig = await this.generateTsConfig(context);
    project.addFile('tsconfig.json', tsConfig);

    // Generate domain layer
    const domainCode = await this.generateDomainLayer(context);
    project.addFiles('src/domain', domainCode);

    // Generate application layer
    const applicationCode = await this.generateApplicationLayer(context);
    project.addFiles('src/application', applicationCode);

    // Generate infrastructure layer
    const infrastructureCode = await this.generateInfrastructureLayer(context);
    project.addFiles('src/infrastructure', infrastructureCode);

    // Generate tests
    if (context.options.includeTests) {
      const testCode = await this.generateTests(context);
      project.addFiles('tests', testCode);
    }

    // Generate deployment files
    const deploymentCode = await this.generateDeploymentFiles(context);
    project.addFiles('deployment', deploymentCode);

    return project;
  }

  private async generateDomainLayer(context: GenerationContext): Promise<GeneratedFile[]> {
    const files: GeneratedFile[] = [];

    // Generate entities
    for (const entity of context.app.getEntities()) {
      const code = await this.renderTemplate('domain/entity', {
        entity,
        app: context.app
      });
      files.push(new GeneratedFile(`entities/${entity.name}.ts`, code));
    }

    // Generate value objects
    for (const valueObject of context.app.getValueObjects()) {
      const code = await this.renderTemplate('domain/value-object', {
        valueObject,
        app: context.app
      });
      files.push(new GeneratedFile(`value-objects/${valueObject.name}.ts`, code));
    }

    // Generate repositories
    for (const repository of context.app.getRepositories()) {
      const code = await this.renderTemplate('domain/repository', {
        repository,
        app: context.app
      });
      files.push(new GeneratedFile(`repositories/${repository.name}.ts`, code));
    }

    return files;
  }

  protected getLanguageSpecificHelpers(): Record<string, Function> {
    return {
      tsType: (type: string) => this.mapType(type),
      import: (module: string, exports: string[]) => 
        `import { ${exports.join(', ')} } from '${module}';`,
      async: (returnType: string) => `Promise<${returnType}>`,
      interface: (name: string, properties: any[]) => 
        this.generateInterface(name, properties)
    };
  }

  protected mapType(type: string): string {
    return this.languageModel.types[type] || type;
  }
}
```

#### Python Generator
```typescript
export class PythonGenerator extends CodeGenerator {
  constructor() {
    super(Language.PYTHON, new Jinja2Engine(), PythonModel);
  }

  async generateApp(context: GenerationContext): Promise<GeneratedProject> {
    const project = new GeneratedProject(context.outputPath);

    // Generate setup.py
    const setupPy = await this.generateSetupPy(context);
    project.addFile('setup.py', setupPy);

    // Generate requirements.txt
    const requirements = await this.generateRequirements(context);
    project.addFile('requirements.txt', requirements);

    // Generate domain layer
    const domainCode = await this.generateDomainLayer(context);
    project.addFiles('src/domain', domainCode);

    // Generate application layer
    const applicationCode = await this.generateApplicationLayer(context);
    project.addFiles('src/application', applicationCode);

    // Generate infrastructure layer
    const infrastructureCode = await this.generateInfrastructureLayer(context);
    project.addFiles('src/infrastructure', infrastructureCode);

    return project;
  }

  protected getLanguageSpecificHelpers(): Record<string, Function> {
    return {
      python_type: (type: string) => this.mapType(type),
      import_statement: (module: string, items: string[]) => 
        `from ${module} import ${items.join(', ')}`,
      dataclass: (name: string, fields: any[]) => 
        this.generateDataclass(name, fields),
      async_def: (name: string, params: any[], returnType: string) =>
        `async def ${name}(${this.formatParams(params)}) -> ${returnType}:`
    };
  }

  protected mapType(type: string): string {
    const typeMap: Record<string, string> = {
      'string': 'str',
      'number': 'float',
      'integer': 'int',
      'boolean': 'bool',
      'date': 'datetime',
      'uuid': 'UUID',
      'array': 'List',
      'object': 'Dict'
    };
    
    return typeMap[type] || type;
  }
}
```

### Generation Orchestration

```typescript
export class CodeGenerationService {
  constructor(
    private generators: Map<Language, CodeGenerator>,
    private templateRepository: TemplateRepository,
    private dependencyAnalyzer: DependencyAnalyzer
  ) {}

  async generateProject(request: GenerationRequest): Promise<GenerationResult> {
    try {
      // 1. Validate request
      const validation = await this.validateRequest(request);
      if (!validation.isValid()) {
        throw new GenerationError(`Invalid request: ${validation.getErrors()}`);
      }

      // 2. Analyze dependencies
      const dependencies = await this.dependencyAnalyzer.analyze(request.context);

      // 3. Select generator
      const generator = this.generators.get(request.context.targetLanguage);
      if (!generator) {
        throw new GenerationError(`No generator found for language: ${request.context.targetLanguage}`);
      }

      // 4. Generate code
      const project = await generator.generateApp(request.context);

      // 5. Add dependency files
      await this.addDependencyFiles(project, dependencies);

      // 6. Format code
      await this.formatCode(project, request.context.targetLanguage);

      // 7. Validate generated code
      const codeValidation = await this.validateGeneratedCode(project);
      if (!codeValidation.isValid()) {
        throw new GenerationError(`Generated code validation failed: ${codeValidation.getErrors()}`);
      }

      return GenerationResult.success(project);
    } catch (error) {
      return GenerationResult.failure(error.message);
    }
  }

  private async validateRequest(request: GenerationRequest): Promise<ValidationResult> {
    const errors: string[] = [];

    // Validate language support
    if (!this.generators.has(request.context.targetLanguage)) {
      errors.push(`Unsupported language: ${request.context.targetLanguage}`);
    }

    // Validate app definition
    const appValidation = request.context.app.validate();
    errors.push(...appValidation.getErrors());

    // Validate compatibility
    const compatibility = await this.checkCompatibility(request.context);
    errors.push(...compatibility.getErrors());

    return ValidationResult.create(errors);
  }
}
```

## Implementation Plan

### Phase 1: Foundation (Week 1)
- [ ] Create generation context models
- [ ] Implement template engine abstraction
- [ ] Define language models for TypeScript and Python
- [ ] Create base generator class

### Phase 2: TypeScript Generator (Week 2)
- [ ] Implement complete TypeScript generator
- [ ] Create comprehensive TypeScript templates
- [ ] Add formatting and validation
- [ ] Integration tests with sample apps

### Phase 3: Python Generator (Week 3)
- [ ] Implement Python generator
- [ ] Create Python templates (FastAPI/Django variants)
- [ ] Add Python-specific tooling integration
- [ ] Cross-language compatibility testing

### Phase 4: Additional Languages (Week 4)
- [ ] Implement Go generator (basic)
- [ ] Create foundation for Java/C# generators
- [ ] Add generation service orchestration
- [ ] Performance optimization and caching

## Testing Strategy

### Template Testing
```typescript
describe('TypeScript Templates', () => {
  let generator: TypeScriptGenerator;
  
  beforeEach(() => {
    generator = new TypeScriptGenerator();
  });

  it('should generate valid entity class', async () => {
    const entity = createTestEntity('User', [
      { name: 'id', type: 'uuid' },
      { name: 'email', type: 'string' }
    ]);

    const code = await generator.renderTemplate('domain/entity', { entity });

    expect(code).toContain('export class User');
    expect(code).toContain('private id: string');
    expect(code).toContain('private email: string');
    expect(TypeScript.transpile(code)).toBeTruthy(); // Syntax validation
  });
});
```

### Cross-Language Compatibility
```typescript
describe('Cross-Language Generation', () => {
  const languages = [Language.TYPESCRIPT, Language.PYTHON];
  
  languages.forEach(language => {
    it(`should generate functionally equivalent code in ${language}`, async () => {
      const context = createTestContext(language);
      const generator = createGenerator(language);
      
      const project = await generator.generateApp(context);
      
      // Validate architectural consistency
      expect(project.hasDomainLayer()).toBe(true);
      expect(project.hasApplicationLayer()).toBe(true);
      expect(project.hasInfrastructureLayer()).toBe(true);
      
      // Validate specific patterns
      expect(project.implementsRepositoryPattern()).toBe(true);
      expect(project.implementsCommandPattern()).toBe(true);
    });
  });
});
```

## Migration Strategy

### Gradual Language Support Addition
1. **Start with TypeScript** (current language)
2. **Add Python support** (popular alternative)
3. **Extend to Go/Java** (enterprise languages)
4. **Community-driven languages** (Rust, C#, etc.)

### Backward Compatibility
- Existing JavaScript/TypeScript projects remain fully supported
- Generation system is additive to current functionality
- CLI commands maintain existing behavior with new generation options

## Success Metrics

- **Language Coverage**: Support for 5+ major languages
- **Template Quality**: Generated code passes language-specific linting
- **Performance**: Sub-30 second generation for typical applications
- **Adoption**: 25% of new projects use non-TypeScript languages

## Security Considerations

- Template injection prevention
- Generated code security scanning
- Dependency vulnerability checking
- Secure credential handling in generated deployment files

## Future Considerations

This RFC enables:
- Community-contributed language generators
- IDE plugins for real-time generation
- Cloud-based generation services
- Custom enterprise language variants
- AI-assisted template optimization