#!/bin/bash
# Manual database recovery script with confirmation prompts
# Usage: kubectl exec -it <pod-name> -n coder -- /app/scripts/manual-recovery.sh

set -e

DB_PATH="/app/data/ccflare.db"
BACKUP_DIR="/app/data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🔧 Manual Database Recovery Assistant"
echo "Database: $DB_PATH"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Function to ask for confirmation
confirm() {
    echo -n "$1 (y/N): "
    read -r response
    case "$response" in
        [yY][eE][sS]|[yY]) 
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Step 1: Backup current state
echo "STEP 1: Backup current database state"
echo "======================================"
if confirm "Create backup of current database files?"; then
    if [ -f "$DB_PATH" ]; then
        cp "$DB_PATH" "$BACKUP_DIR/ccflare.db.backup.$TIMESTAMP"
        echo "✅ Backed up main database"
    fi
    if [ -f "$DB_PATH-wal" ]; then
        cp "$DB_PATH-wal" "$BACKUP_DIR/ccflare.db-wal.backup.$TIMESTAMP"
        echo "✅ Backed up WAL file"
    fi
    if [ -f "$DB_PATH-shm" ]; then
        cp "$DB_PATH-shm" "$BACKUP_DIR/ccflare.db-shm.backup.$TIMESTAMP"
        echo "✅ Backed up SHM file"
    fi
    echo "📁 Backups saved in: $BACKUP_DIR"
else
    echo "⚠️  Skipping backup - proceeding without safety net"
fi

echo ""

# Step 2: Integrity check
echo "STEP 2: Database integrity check"
echo "================================"
if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
    echo "✅ Database integrity: OK"
    echo "   The database may not be corrupted. Check for:"
    echo "   - File locking issues"
    echo "   - Permission problems"
    echo "   - Concurrent access"
    exit 0
else
    echo "❌ Database integrity check failed"
    echo "   Corruption detected - proceeding with recovery"
fi

echo ""

# Step 3: WAL checkpoint
echo "STEP 3: WAL checkpoint recovery"
echo "==============================="
if [ -f "$DB_PATH-wal" ] && [ -s "$DB_PATH-wal" ]; then
    echo "WAL file found with data"
    if confirm "Attempt WAL checkpoint to recover recent transactions?"; then
        if sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(FULL);" 2>/dev/null; then
            echo "✅ WAL checkpoint successful"
            
            # Check if this fixed the corruption
            if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
                echo "🎉 Database recovered via WAL checkpoint!"
                echo "   Cleaning up WAL files..."
                rm -f "$DB_PATH-wal" "$DB_PATH-shm"
                echo "✅ Recovery complete"
                exit 0
            else
                echo "❌ WAL checkpoint didn't fix corruption"
            fi
        else
            echo "❌ WAL checkpoint failed"
        fi
    else
        echo "⏭️  Skipping WAL checkpoint"
    fi
else
    echo "ℹ️  No WAL file or empty WAL file"
fi

echo ""

# Step 4: Database dump
echo "STEP 4: Database dump recovery"
echo "============================="
if confirm "Attempt to dump readable data from database?"; then
    DUMP_FILE="$BACKUP_DIR/recovery_dump.$TIMESTAMP.sql"
    echo "Dumping database to: $DUMP_FILE"
    
    if sqlite3 "$DB_PATH" ".dump" > "$DUMP_FILE" 2>/dev/null && [ -s "$DUMP_FILE" ]; then
        echo "✅ Database dump successful"
        echo "   Dump size: $(du -h "$DUMP_FILE" | cut -f1)"
        
        if confirm "Create new database from dump? (REPLACES CURRENT DATABASE)"; then
            echo "⚠️  Creating new database from dump..."
            
            # Move corrupted files
            mv "$DB_PATH" "$BACKUP_DIR/ccflare.db.corrupted.$TIMESTAMP" 2>/dev/null || true
            mv "$DB_PATH-wal" "$BACKUP_DIR/ccflare.db-wal.corrupted.$TIMESTAMP" 2>/dev/null || true
            mv "$DB_PATH-shm" "$BACKUP_DIR/ccflare.db-shm.corrupted.$TIMESTAMP" 2>/dev/null || true
            
            # Restore from dump
            if sqlite3 "$DB_PATH" < "$DUMP_FILE" 2>/dev/null; then
                echo "✅ Database restored from dump"
                
                # Verify restored database
                if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
                    echo "🎉 Database recovery successful!"
                    echo "   Restored database passes integrity check"
                    exit 0
                else
                    echo "❌ Restored database failed integrity check"
                    echo "   Manual intervention required"
                fi
            else
                echo "❌ Failed to restore database from dump"
            fi
        else
            echo "⏭️  Dump created but not applied"
            echo "   Manual restore: sqlite3 $DB_PATH < $DUMP_FILE"
        fi
    else
        echo "❌ Database dump failed"
    fi
else
    echo "⏭️  Skipping database dump"
fi

echo ""

# Step 5: Advanced recovery
echo "STEP 5: Advanced recovery options"
echo "================================="
echo "Manual recovery commands to try:"
echo ""
echo "1. SQLite recovery mode:"
echo "   sqlite3 $DB_PATH '.recover' > $BACKUP_DIR/recover_$TIMESTAMP.sql"
echo ""
echo "2. Partial dump (skip errors):"
echo "   sqlite3 $DB_PATH '.dump' | grep -v '^ROLLBACK' > $BACKUP_DIR/partial_$TIMESTAMP.sql"
echo ""
echo "3. Change journal mode:"
echo "   sqlite3 $DB_PATH 'PRAGMA journal_mode=DELETE; VACUUM;'"
echo ""
echo "4. Examine specific tables:"
echo "   sqlite3 $DB_PATH 'SELECT COUNT(*) FROM requests;'"
echo "   sqlite3 $DB_PATH 'SELECT * FROM requests LIMIT 10;'"
echo ""

if confirm "Run SQLite recovery mode (.recover)?"; then
    RECOVER_FILE="$BACKUP_DIR/recover_$TIMESTAMP.sql"
    echo "Running recovery mode..."
    if sqlite3 "$DB_PATH" ".recover" > "$RECOVER_FILE" 2>/dev/null; then
        echo "✅ Recovery mode completed"
        echo "   Output: $RECOVER_FILE"
        echo "   Size: $(du -h "$RECOVER_FILE" | cut -f1)"
    else
        echo "❌ Recovery mode failed"
    fi
fi

echo ""
echo "🔧 Manual recovery session complete"
echo "📁 All files saved in: $BACKUP_DIR"
echo "⚠️  If recovery failed, consider:"
echo "   - Restoring from external backups"
echo "   - Contacting database administrator"
echo "   - Creating fresh database (DATA LOSS)"
