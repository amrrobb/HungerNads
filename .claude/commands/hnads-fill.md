# Fill Lobby - Quick Test Setup

Create a new lobby and fill it with AI agents. Supports paid lobbies via ephemeral wallets.

## Arguments

**Format**: `$ARGUMENTS`

- First positional arg: `count` (optional, default 5) — number of agents to join
- `--fee=AMOUNT`: set entrance fee in MON (e.g., `--fee=0.01`)
- `--base-url=URL`: override API base URL

## Configuration

```
API_BASE = environment variable HUNGERNADS_API, or default "http://localhost:8787"
DASHBOARD = environment variable HUNGERNADS_DASHBOARD, or default "http://localhost:3000"
RPC_URL = "https://testnet-rpc.monad.xyz"
CHAIN_ID = 10143
ARENA_CONTRACT = "0xc4CebF58836707611439e23996f4FA4165Ea6A28"
```

## Execution

### Step 1: Create a new lobby

Build the create payload. If `--fee` is provided, include it:

```bash
# Without fee
curl -s -X POST "${API_BASE}/battle/create" \
  -H "Content-Type: application/json" \
  -d '{}'

# With fee
curl -s -X POST "${API_BASE}/battle/create" \
  -H "Content-Type: application/json" \
  -d '{"feeAmount": "0.01"}'
```

Extract `battleId` from response. If error, report and abort.

### Step 2: Wallet setup (only if fee > 0)

If `--fee` was provided (or lobby has a non-zero fee):

1. **Find private key**: Check `HUNGERNADS_PRIVATE_KEY` env var. If not set, look for `PRIVATE_KEY` in `.env` file. If neither found, error:
   ```
   ERROR: Wallet required for paid lobby.
   Set HUNGERNADS_PRIVATE_KEY env var or add PRIVATE_KEY to .env
   ```

2. **Derive funder address**:
   ```bash
   cast wallet address --private-key $MAIN_PK
   ```

3. **Check funder balance**:
   ```bash
   cast balance --rpc-url https://testnet-rpc.monad.xyz $FUNDER_ADDRESS --ether
   ```

4. **Calculate total cost**: Each agent gets 1 MON (covers any fee + gas). Total = `count * 1 MON`.
   Show cost summary and proceed:
   ```
   === WALLET SETUP ===
   Funder: 0x1234...abcd
   Balance: 10.5 MON
   Funding per agent: 1 MON
   Total cost: ~5.0 MON (5 agents × 1 MON)
   ```

   If balance < total cost, error with clear message showing the shortfall.

### Step 3: Join agents

For each agent (1 to count):

1. **Name**: Generate random name: `[A-Z]{2,4}_[A-Z0-9]{1,3}` (e.g., "NAD_7X", "REKT_42")
2. **Class**: Pick randomly from WARRIOR, TRADER, SURVIVOR, PARASITE, GAMBLER (use all 5 different classes if count >= 5)

3. **If fee > 0** (paid lobby):
   a. Generate ephemeral wallet:
      ```bash
      cast wallet new --json
      ```
      Extract `address` and `privateKey` from JSON output.

   b. Fund ephemeral wallet with 1 MON from main PK:
      ```bash
      cast send --rpc-url https://testnet-rpc.monad.xyz \
        --private-key $MAIN_PK \
        $AGENT_ADDRESS \
        --value 1ether
      ```
      Wait for tx confirmation. If it fails, report error and skip this agent.

   c. Pay entrance fee from ephemeral wallet to arena contract:
      ```bash
      cast send --rpc-url https://testnet-rpc.monad.xyz \
        --private-key $AGENT_PK \
        0xc4CebF58836707611439e23996f4FA4165Ea6A28 \
        --value ${FEE}ether
      ```
      Capture the transaction hash from output.

   d. Join with txHash and walletAddress:
      ```bash
      curl -s -X POST "${API_BASE}/battle/${battleId}/join" \
        -H "Content-Type: application/json" \
        -d '{"agentClass": "WARRIOR", "agentName": "NAD_7X", "txHash": "0x...", "walletAddress": "0x..."}'
      ```

4. **If fee = 0** (free lobby):
   ```bash
   curl -s -X POST "${API_BASE}/battle/${battleId}/join" \
     -H "Content-Type: application/json" \
     -d '{"agentClass": "WARRIOR", "agentName": "NAD_7X"}'
   ```

5. Show progress for each agent:
   ```
   [1/5] WARRIOR "NAD_7X" -> funded 1 MON -> paid ${fee} MON (tx: 0xabcd...) -> Joined!
   [2/5] TRADER  "REKT_42" -> funded 1 MON -> paid ${fee} MON (tx: 0xefgh...) -> Joined!
   ```

### Step 4: Summary

```
=== LOBBY CREATED & FILLED ===
Battle: ${battleId}
Agents: ${count}/8 gladiators
Fee: ${fee} MON per agent

  WARRIOR  "NAD_7X"    wallet: 0x1234...abcd
  TRADER   "REKT_42"   wallet: 0x5678...efgh
  SURVIVOR "GLD_A3"    wallet: 0x9abc...1234
  PARASITE "COPY_3"    wallet: 0xdef0...5678
  GAMBLER  "YOLO_99"   wallet: 0x2345...9abc

${count >= 5 ? 'COUNTDOWN ACTIVE - Battle starts in ~60s!' : `Need ${5 - count} more agents to start. Run: /hnads-join ${battleId.slice(0,8)} ${5 - count}`}

Watch: ${DASHBOARD}/lobby/${battleId}
```

## Error Handling

- **No private key**: Clear error message with setup instructions
- **Insufficient balance**: Show required vs available, abort before any funding
- **Funding tx fails**: Skip that agent, continue with others, report at end
- **Fee payment fails**: Skip that agent, report the error
- **402 Payment Required**: Fee required but no txHash — should not happen if wallet flow works
- **cast not found**: Error "Foundry's cast CLI is required. Install: curl -L https://foundry.paradigm.xyz | bash"
