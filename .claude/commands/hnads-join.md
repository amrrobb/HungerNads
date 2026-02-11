# Join a HungerNads Lobby

Add one or more AI agents to an open battle lobby. Automatically handles payment for paid lobbies.

## Arguments

**Format**: `$ARGUMENTS`

Parse arguments:
- First positional arg: `battle_id` (required) — full UUID or first 8 chars
- Second positional arg: `count` (optional, default 1) — number of agents to join
- `--class=CLASS`: force a specific class (WARRIOR, TRADER, SURVIVOR, PARASITE, GAMBLER)
- `--name=NAME`: set a specific agent name (only works with count=1)

## Configuration

```
API_BASE = environment variable HUNGERNADS_API, or default "http://localhost:8787"
DASHBOARD = environment variable HUNGERNADS_DASHBOARD, or default "http://localhost:3000"
RPC_URL = "https://testnet-rpc.monad.xyz"
CHAIN_ID = 10143
ARENA_CONTRACT = "0xc4CebF58836707611439e23996f4FA4165Ea6A28"
```

## Execution

### Step 1: Resolve battle ID

If battle_id is < 36 chars (partial), fetch lobbies to find the full UUID:
```bash
curl -s "${API_BASE}/battle/lobbies"
```
Match the partial ID against `battleId` in results. If no match, try using it as-is.

### Step 2: Check lobby status and fee

Fetch battle details:
```bash
curl -s "${API_BASE}/battle/${battle_id}"
```

Extract `feeAmount` from the response. Show current lobby status before joining.

### Step 3: Wallet setup (only if fee > 0)

If the lobby has a non-zero `feeAmount`:

1. **Find private key**: Check `HUNGERNADS_PRIVATE_KEY` env var. If not set, look for `PRIVATE_KEY` in `.env` file. If neither found, error:
   ```
   ERROR: Wallet required — this lobby has a ${feeAmount} MON entry fee.
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
   Show cost summary:
   ```
   === PAYMENT REQUIRED ===
   Lobby fee: ${feeAmount} MON per agent
   Funding per agent: 1 MON
   Agents: ${count}
   Total cost: ~${count} MON
   Funder: 0x1234...abcd (balance: 10.5 MON)
   ```

   If balance < total cost, error with clear message showing the shortfall.

### Step 4: Join agents

For each agent (1 to count):

1. **Name**: If --name provided and count=1, use it. Otherwise generate a random name:
   - Pattern: `[A-Z]{2,4}_[A-Z0-9]{1,3}` (e.g., "NAD_7X", "REKT_42", "GLD_A3", "MON_99")
   - Max 12 chars, alphanumeric + underscore only

2. **Class**: If --class provided, use it. Otherwise pick randomly from:
   WARRIOR, TRADER, SURVIVOR, PARASITE, GAMBLER

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
      curl -s -X POST "${API_BASE}/battle/${battle_id}/join" \
        -H "Content-Type: application/json" \
        -d '{"agentClass": "WARRIOR", "agentName": "NAD_7X", "txHash": "0x...", "walletAddress": "0x..."}'
      ```

4. **If fee = 0** (free lobby):
   ```bash
   curl -s -X POST "${API_BASE}/battle/${battle_id}/join" \
     -H "Content-Type: application/json" \
     -d '{"agentClass": "WARRIOR", "agentName": "NAD_7X"}'
   ```

5. **Report each join**:
   ```
   [1/5] WARRIOR "NAD_7X"   -> funded 1 MON -> paid ${fee} MON (tx: 0xab..cd) -> Slot 3  (3/8)
   [2/5] GAMBLER "REKT_42"  -> funded 1 MON -> paid ${fee} MON (tx: 0xef..12) -> Slot 4  (4/8)
   [3/5] SURVIVOR "GLD_A3"  -> funded 1 MON -> paid ${fee} MON (tx: 0x34..56) -> Slot 5  (5/8)  ** COUNTDOWN TRIGGERED! **
   ```

   For free lobbies, omit the funded/paid parts:
   ```
   [1/5] WARRIOR "NAD_7X"   -> Slot 3  (3/8)
   ```

### Step 5: Summary

```
=== JOINED ===
${successCount}/${count} agents joined successfully
Lobby: ${totalPlayers}/8 gladiators
${fee > 0 ? `Total spent: ${totalSpent} MON` : ''}
Countdown: ${status}

Watch live: ${DASHBOARD}/lobby/${battle_id}
```

## Error Handling

- 402 (payment required): Lobby has a fee — triggers wallet flow automatically
- 409 (lobby full): Stop joining, report how many succeeded
- 409 (duplicate name): Retry with a different generated name (up to 3 retries)
- 409 (wrong status): Battle already started or cancelled
- 404: Battle not found
- Connection error: API unreachable, check HUNGERNADS_API setting
- **No private key**: Clear error message with setup instructions
- **Insufficient balance**: Show required vs available, abort before any funding
- **Funding tx fails**: Skip that agent, continue with others, report at end
- **cast not found**: Error "Foundry's cast CLI is required. Install: curl -L https://foundry.paradigm.xyz | bash"
