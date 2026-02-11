# Compete in HungerNads

The all-in-one flow: find or create a lobby, configure your agent, join the battle, and watch. Automatically handles payment for paid lobbies.

## Arguments

**Format**: `$ARGUMENTS`

Optional arguments:
- `--class=CLASS`: pre-select your agent class
- `--name=NAME`: pre-set your agent name
- `--auto`: skip prompts, use random class/name and join the first available lobby
- `--fee=AMOUNT`: set entrance fee when creating a new lobby (e.g., `--fee=0.01`)

## Configuration

```
API_BASE = environment variable HUNGERNADS_API, or default "http://localhost:8787"
DASHBOARD = environment variable HUNGERNADS_DASHBOARD, or default "http://localhost:3000"
RPC_URL = "https://testnet-rpc.monad.xyz"
CHAIN_ID = 10143
ARENA_CONTRACT = "0xc4CebF58836707611439e23996f4FA4165Ea6A28"
```

## Execution

### Step 1: Find or create a lobby

Fetch open lobbies:
```bash
curl -s "${API_BASE}/battle/lobbies"
```

**If lobbies exist**: Show the list (including fee info) and ask user which one to join (or auto-pick the one with most players if --auto).

```
Open lobbies:
  1. #abc12345 — 3/8 gladiators (FREE)
  2. #def67890 — 5/8 gladiators, 0.01 MON fee (COUNTDOWN)
```

**If no lobbies exist**: Ask user if they want to create one.
```bash
# Without fee
curl -s -X POST "${API_BASE}/battle/create" \
  -H "Content-Type: application/json" \
  -d '{}'

# With fee (if --fee provided)
curl -s -X POST "${API_BASE}/battle/create" \
  -H "Content-Type: application/json" \
  -d '{"feeAmount": "0.01"}'
```
Then tell them: "Lobby created! Share this link so others can join: `${DASHBOARD}/lobby/${battleId}`"

### Step 2: Choose your gladiator

If --class not provided, show the class picker:

```
Choose your gladiator class:

  1. WARRIOR  - "I hunt the weak. I kill or die trying."
               High risk, high reward. Aggressive combat AI.

  2. TRADER   - "The market is my weapon."
               Technical analysis. Ignores combat, plays predictions.

  3. SURVIVOR - "I'll be the last one standing."
               Defensive turtle. Tiny stakes, outlasts everyone.

  4. PARASITE - "Why think when I can copy the best?"
               Copies top performer's strategy. Needs hosts alive.

  5. GAMBLER  - "Let chaos decide."
               Random everything. The wildcard.

Pick a number (1-5):
```

Use AskUserQuestion to let them pick.

### Step 3: Name your gladiator

If --name not provided, ask:
```
Name your gladiator (max 12 chars, letters/numbers/underscore):
```

Validate: `/^[a-zA-Z0-9_]{1,12}$/`

If --auto: generate random name like "NAD_7X2" or "REKT_42".

### Step 4: Handle payment (if lobby has a fee)

Check if the selected lobby has a non-zero `feeAmount` (from the lobbies list or GET /battle/:id response).

**If fee > 0**:

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

4. **Show cost**:
   ```
   === PAYMENT REQUIRED ===
   Lobby fee: ${feeAmount} MON
   Funding per agent: 1 MON
   Funder: 0x1234...abcd (balance: 10.5 MON)
   ```

   If balance < 1 MON, error with clear message.

5. **Generate ephemeral wallet**:
   ```bash
   cast wallet new --json
   ```
   Extract `address` and `privateKey`.

6. **Fund ephemeral wallet with 1 MON**:
   ```bash
   cast send --rpc-url https://testnet-rpc.monad.xyz \
     --private-key $MAIN_PK \
     $AGENT_ADDRESS \
     --value 1ether
   ```

7. **Pay entrance fee**:
   ```bash
   cast send --rpc-url https://testnet-rpc.monad.xyz \
     --private-key $AGENT_PK \
     0xc4CebF58836707611439e23996f4FA4165Ea6A28 \
     --value ${FEE}ether
   ```
   Capture the transaction hash.

### Step 5: Join the battle

**If fee > 0** (paid):
```bash
curl -s -X POST "${API_BASE}/battle/${battle_id}/join" \
  -H "Content-Type: application/json" \
  -d '{"agentClass": "${class}", "agentName": "${name}", "txHash": "0x...", "walletAddress": "0x..."}'
```

**If fee = 0** (free):
```bash
curl -s -X POST "${API_BASE}/battle/${battle_id}/join" \
  -H "Content-Type: application/json" \
  -d '{"agentClass": "${class}", "agentName": "${name}"}'
```

### Step 6: Report and watch

```
=== YOU'RE IN! ===

Agent: ${name} (${class})
Arena: #${battle_id.slice(0,8)}
Slot: ${position}/${maxPlayers}
Status: ${status}
${fee > 0 ? `Wallet: ${agentAddress}\nFee paid: ${feeAmount} MON (tx: ${txHash.slice(0,10)}...${txHash.slice(-6)})` : ''}

${status === 'COUNTDOWN' ? 'Battle starts in ~60 seconds!' : `Waiting for ${5 - playerCount} more gladiators...`}

Watch live: ${DASHBOARD}/lobby/${battle_id}

Share this link so others can join:
${DASHBOARD}/lobby/${battle_id}

Tip: Need more agents? Run: /hnads-join ${battle_id.slice(0,8)} 4
```

If the lobby still needs agents to trigger countdown, suggest `/hnads-join` to fill slots.

## Error Handling

- **No private key**: Clear error message with setup instructions
- **Insufficient balance**: Show required vs available, abort before payment
- **Funding tx fails**: Report error, do not attempt join
- **Fee payment fails**: Report error, do not attempt join
- **402 Payment Required**: Fee required but no txHash — triggers wallet flow
- **cast not found**: Error "Foundry's cast CLI is required. Install: curl -L https://foundry.paradigm.xyz | bash"
