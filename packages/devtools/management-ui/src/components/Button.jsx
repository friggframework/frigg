<<<<<<< HEAD
<<<<<<< HEAD
// Re-export shadcn Button component
export { Button } from './ui/button'
=======
import React from 'react';
import { cn } from '../utils/cn';

const Button = React.forwardRef(({ 
  className, 
  variant = 'default', 
  size = 'default', 
  children, 
  disabled,
  ...props 
}, ref) => {
  const variants = {
    default: 'bg-blue-600 text-white hover:bg-blue-700 border-transparent',
    destructive: 'bg-red-600 text-white hover:bg-red-700 border-transparent',
    outline: 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50',
    secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 border-transparent',
    ghost: 'hover:bg-gray-100 text-gray-700 border-transparent',
    link: 'underline-offset-4 hover:underline text-blue-600 border-transparent bg-transparent p-0 h-auto',
    success: 'bg-green-600 text-white hover:bg-green-700 border-transparent',
    warning: 'bg-orange-600 text-white hover:bg-orange-700 border-transparent',
  };

  const sizes = {
    default: 'h-10 px-4 py-2',
    sm: 'h-9 px-3 text-sm',
    lg: 'h-11 px-8',
    icon: 'h-10 w-10',
  };

  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 border',
        variants[variant],
        sizes[size],
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      ref={ref}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
});

Button.displayName = 'Button';

export { Button };
>>>>>>> 652520a5 (Claude Flow RFC related development)
=======
// Re-export shadcn Button component
export { Button } from './ui/button'
>>>>>>> f153939e (refactor: clean up CLI help display and remove unused dependencies)
