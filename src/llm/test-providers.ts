#!/usr/bin/env npx tsx
/**
 * Test script for multi-provider LLM
 * 
 * Run: npx tsx src/llm/test-providers.ts
 */

import { MultiProviderLLM } from './multi-provider';

async function main() {
  console.log('🦞 HUNGERNADS - LLM Provider Test\n');
  
  // Check which env vars are set
  console.log('Environment check:');
  console.log(`  GROQ_API_KEY: ${process.env.GROQ_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log(`  OPENROUTER_API_KEY: ${process.env.OPENROUTER_API_KEY ? '✅ Set' : '❌ Not set'}`);
  console.log('');

  try {
    const llm = new MultiProviderLLM();
    
    // Show status
    console.log('Provider Status:');
    const status = llm.getStatus();
    status.forEach(p => {
      console.log(`  ${p.name}: ${p.available}/${p.limit} available`);
    });
    console.log(`  TOTAL: ${llm.getTotalRemaining()} requests available\n`);

    // Test call
    console.log('Testing LLM call...\n');
    
    const response = await llm.chat([
      { role: 'system', content: 'You are a gladiator AI agent. Be brief.' },
      { role: 'user', content: 'Say your battle cry in 10 words or less!' },
    ], { maxTokens: 50 });

    console.log(`✅ Success!`);
    console.log(`   Provider: ${response.provider}`);
    console.log(`   Model: ${response.model}`);
    console.log(`   Response: "${response.content}"\n`);

    // Updated status
    console.log('Updated Status:');
    llm.getStatus().forEach(p => {
      console.log(`  ${p.name}: ${p.available}/${p.limit} available`);
    });

  } catch (error: any) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
