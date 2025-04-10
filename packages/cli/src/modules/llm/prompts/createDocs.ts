export const createDocsPrompt = (code: string, isEntryPoint: boolean) => `Add JSDoc comments to this TypeScript/JavaScript code. Follow these specific rules:

1. Documentation Placement Rules:
   - Place documentation at the highest possible scope (e.g., before interfaces, component definitions)
   - Only add proper JSDoc format comments (/** ... */ style)
   - The @packageDocumentation tag should ONLY be added to index.ts/js or main.ts/js files that serve as the main entry point for a package
   - Other files should NOT include a @packageDocumentation tag
   - Mid-stream comments are only allowed for unique circumstances (magic numbers, complex algorithms) that would be confusing without context

2. Required Documentation:
   - Interface/Type documentation: purpose, properties, usage
   - Create @typedef tags for any moderately complex object types, prop types, etc.
   - Component/Class documentation: functionality, props/methods, state, effects
   - Function documentation: purpose, parameters, return value, side effects
   - Document any complex logic or business rules

3. React Component Documentation:
   - Place JSDoc comments directly above the component definition
   - Provide a clear @description of the component's purpose
   - Document each prop using @param {type} props.propName - Description
   - Use @returns {JSX.Element} or @returns {React.ReactNode} to indicate return type
   - Use @property to define the type and description of each prop
   - Include at least one @example for usage (multiple for different use cases/variants)
   - Use @fires to document which events the component emits
   - Use @see to refer to related components or functions

4. Event Handler Documentation:
   - Use @param with React.ChangeEvent, React.MouseEvent, etc. to document event handler parameters
   - Specify the return type of the function if applicable

5. Style Rules:
   - Keep comments focused and concise
   - Use clear, professional language
   - Avoid redundant or obvious documentation
   - No inline comments between code lines unless absolutely necessary for clarity

6. Response Format:
   - Return ONLY the documented code
   - Do not wrap the code in markdown code blocks
   - Do not add any explanatory text
   - Do not use triple backticks
   - Do not modify the code structure in any way
   - Only add or modify comments

7. Special Instructions for This File:
   ${isEntryPoint 
     ? "- This file IS a package entry point: ADD a @packageDocumentation tag with a comprehensive description of the package's purpose and functionality at the top of the file" 
     : "- This file is NOT a package entry point: DO NOT add a @packageDocumentation tag to this file"}

Code to document:
${code}`; 