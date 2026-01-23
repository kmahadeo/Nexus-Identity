import { OpenAI } from 'openai';
import { VaultEntry } from '@/types';


interface SecurityContext {
  vaultEntries: VaultEntry[];
  authLogs: AuthEvent[];
  deviceTrustScore: number; // 0-100
}

export async function buildSecurityContext(userId: string, userQuery: string) {
  // 1. Fetch Real-Time Data (Simulated for this function)
  const context: SecurityContext = await fetchUserSecurityState(userId);

  // 2. Calculated Metrics (The Logic)
  const weakPasswords = context.vaultEntries.filter(e => e.encryptionStrength < 50).length;
  const reusedPasswords = detectReuse(context.vaultEntries);
  const impossibleTravel = detectImpossibleTravel(context.authLogs);

  // 3. Construct the "System Brain"
  const systemPrompt = `
    You are Nexus, an Autonomous Identity Security Engineer.
    
    CURRENT SECURITY POSTURE:
    - User Trust Score: ${context.deviceTrustScore}/100
    - Weak Credentials: ${weakPasswords}
    - Password Reuse: ${reusedPasswords} detected
    - Active Threats: ${impossibleTravel ? 'IMPOSSIBLE_TRAVEL_DETECTED' : 'None'}

    YOUR MISSION:
    Analyze the user's request below. If the request is risky (e.g., "share password"), 
    block it based on the Trust Score. If they ask for help, prioritize 
    fixing the "Weak Credentials" first.
    
    Response Format: JSON { "action": "allow" | "block" | "suggest_fix", "reason": "..." }
  `;

  return systemPrompt;
}

// Helper to calculate password reuse (Logic demonstration)
function detectReuse(entries: VaultEntry[]): number {
  const hashes = entries.map(e => e.passwordHash);
  return new Set(hashes).size !== hashes.length ? 1 : 0;
}
