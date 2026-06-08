/**
 * Unit tests for flashStore — PR-038A
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useFlashStore } from '../../src/lib/flashStore.js';

describe('useFlashStore', () => {
  beforeEach(() => {
    // Reset store state between tests
    useFlashStore.setState({ message: null });
  });

  it('initial state has null message', () => {
    expect(useFlashStore.getState().message).toBeNull();
  });

  it('setMessage stores the message', () => {
    useFlashStore.getState().setMessage('Record created');
    expect(useFlashStore.getState().message).toBe('Record created');
  });

  it('clearMessage resets to null', () => {
    useFlashStore.getState().setMessage('Record created');
    useFlashStore.getState().clearMessage();
    expect(useFlashStore.getState().message).toBeNull();
  });

  it('setMessage overwrites previous message', () => {
    useFlashStore.getState().setMessage('First');
    useFlashStore.getState().setMessage('Second');
    expect(useFlashStore.getState().message).toBe('Second');
  });

  it('clearMessage is idempotent', () => {
    useFlashStore.getState().clearMessage();
    expect(useFlashStore.getState().message).toBeNull();
    useFlashStore.getState().clearMessage();
    expect(useFlashStore.getState().message).toBeNull();
  });
});
