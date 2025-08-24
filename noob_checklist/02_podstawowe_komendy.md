# 🎮 Podstawowe Komendy - Claude Code Toolkit

## 🤖 Claude Code CLI

### Podstawowe komendy
```bash
# Sprawdź wersję
claude --version

# Pomoc i dostępne opcje
claude --help

# Uruchom Claude Code w trybie interaktywnym
claude

# Wznów poprzednią sesję
claude --resume

# Tryb debug
claude --debug

# Sprawdź status
claude --status
```

### Zarządzanie sesjami
```bash
# Lista sesji
claude --list-sessions

# Usuń sesję
claude --delete-session [session-id]

# Eksportuj sesję
claude --export-session [session-id]
```

## 📊 ccstatusline - Statusline Customizer

### Podstawowe użycie
```bash
# Uruchom ccstatusline
ccstatusline

# Z niestandardową konfiguracją
ccstatusline --config ~/.config/claude-code/statusline.json

# Pokaż aktualną konfigurację
ccstatusline --show-config

# Resetuj do domyślnych ustawień
ccstatusline --reset
```

### Przykładowa konfiguracja statusline
```json
{
  "format": "{model} | {branch} | {tokens}",
  "colors": {
    "model": "blue",
    "branch": "green", 
    "tokens": "yellow"
  },
  "refresh_interval": 1000
}
```

## 🔥 ccflare - Load Balancer & Dashboard

### Podstawowe komendy
```bash
# Przejdź do folderu ccflare
cd /Users/marcinnowaczyk/ccflare

# Tryb interaktywny (TUI)
bun run ccflare

# Uruchom serwer z dashboardem (port 8080)
bun run ccflare --serve

# Uruchom na custom porcie
bun run ccflare --serve --port 3000
```

### Zarządzanie kontami
```bash
# Dodaj nowe konto
bun run ccflare --add-account work
bun run ccflare --add-account personal --tier 5

# Lista wszystkich kont
bun run ccflare --list

# Usuń konto
bun run ccflare --remove work

# Zatrzymaj/wznów konto
bun run ccflare --pause work
bun run ccflare --resume work
```

### Monitoring i statystyki
```bash
# Pokaż statystyki (JSON)
bun run ccflare --stats

# Strumień logów (ostatnie 50 linii + follow)
bun run ccflare --logs 50

# Analiza wydajności bazy danych
bun run ccflare --analyze

# Reset statystyk
bun run ccflare --reset-stats

# Wyczyść historię
bun run ccflare --clear-history
```

### Zarządzanie modelami
```bash
# Sprawdź aktualny domyślny model
bun run ccflare --get-model

# Ustaw domyślny model
bun run ccflare --set-model sonnet-4
bun run ccflare --set-model opus-4
```

## 🛠️ Komendy systemowe

### Sprawdzanie instalacji
```bash
# Sprawdź wszystkie zainstalowane narzędzia
claude --version && echo "Claude: OK" || echo "Claude: BŁĄD"
ccstatusline --version 2>/dev/null && echo "ccstatusline: OK" || echo "ccstatusline: Zainstalowane"
cd /Users/marcinnowaczyk/ccflare && bun run ccflare --help >/dev/null && echo "ccflare: OK"
```

### Paths i lokalizacje
```bash
# Gdzie jest claude
which claude

# Gdzie jest ccstatusline  
which ccstatusline

# Lokalizacja ccflare
echo "/Users/marcinnowaczyk/ccflare"
```

## 🔧 Konfiguracja

### Claude Code config
```bash
# Lokalizacja konfiguracji
~/.config/claude-code/settings.json

# Przykładowa konfiguracja
cat ~/.config/claude-code/settings.json
```

### Environment Variables
```bash
# Ustaw API key (dodaj do ~/.zshrc lub ~/.bashrc)
export ANTHROPIC_API_KEY="twój-klucz"
export CLAUDE_CODE_MODEL="claude-sonnet-4"
export CLAUDE_CODE_CONFIG="~/.config/claude-code"
```

## 🚀 Quick Start Workflow

### Codzienne użycie
```bash
# 1. Uruchom ccflare dashboard w tle
cd /Users/marcinnowaczyk/ccflare
bun run ccflare --serve &

# 2. Sprawdź status kont
bun run ccflare --list

# 3. Uruchom Claude Code
claude

# 4. Sprawdź dashboard w przeglądarce
open http://localhost:8080
```

### Debugging workflow
```bash
# 1. Sprawdź logi ccflare
cd /Users/marcinnowaczyk/ccflare
bun run ccflare --logs 20

# 2. Sprawdź statystyki
bun run ccflare --stats

# 3. Uruchom Claude w trybie debug
claude --debug
```

## 💡 Przydatne Aliasy

Dodaj do `~/.zshrc` lub `~/.bashrc`:

```bash
# Claude Code aliases
alias cc='claude'
alias ccv='claude --version'
alias ccr='claude --resume'
alias ccd='claude --debug'

# ccflare aliases  
alias ccf='cd /Users/marcinnowaczyk/ccflare && bun run ccflare'
alias ccfs='cd /Users/marcinnowaczyk/ccflare && bun run ccflare --serve'
alias ccfl='cd /Users/marcinnowaczyk/ccflare && bun run ccflare --list'
alias ccfstats='cd /Users/marcinnowaczyk/ccflare && bun run ccflare --stats'

# Quick status check
alias cccheck='claude --version && ccstatusline --version 2>/dev/null; cd /Users/marcinnowaczyk/ccflare && bun run ccflare --help >/dev/null && echo "Wszystko OK!"'
```

## 🆘 Najczęstsze problemy

### Claude nie startuje
```bash
# Sprawdź API key
echo $ANTHROPIC_API_KEY

# Sprawdź konfigurację
cat ~/.config/claude-code/settings.json
```

### ccflare nie działa
```bash
# Sprawdź czy jesteś w odpowiednim folderze
pwd
# Powinno być: /Users/marcinnowaczyk/ccflare

# Przebuduj jeśli potrzeba
bun run build
```

### Porty zajęte
```bash
# Sprawdź co używa portu 8080
lsof -ti:8080

# Zabij proces
lsof -ti:8080 | xargs kill -9
```