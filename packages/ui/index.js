// @friggframework/ui - Umbrella package for all UI framework implementations
// This package exports all framework-specific UI libraries

export * as core from '@friggframework/ui-core';
export * as react from '@friggframework/ui-react';
export * as vue from '@friggframework/ui-vue';
export * as angular from '@friggframework/ui-angular';
export * as svelte from '@friggframework/ui-svelte';

console.warn(
  '@friggframework/ui is an umbrella package. Consider importing framework-specific packages directly:\n' +
  '- @friggframework/ui-react for React\n' +
  '- @friggframework/ui-vue for Vue\n' +
  '- @friggframework/ui-angular for Angular\n' +
  '- @friggframework/ui-svelte for Svelte\n' +
  '- @friggframework/ui-core for framework-agnostic utilities'
);