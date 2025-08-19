#!/bin/bash
# Emergency database repair script for running inside Kubernetes pod
# Usage: kubectl exec -it <pod-name> -n coder -- /app/scripts/pod-db-repair.sh

set -e

DB_PATH="/app/data/ccflare.db"
BACKUP_DIR="/app/data/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚨 Pod Database Emergency Repair"
echo "Database path: $DB_PATH"
echo "Timestamp: $TIMESTAMP"
echo ""

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Check if database files exist
if [ ! -f "$DB_PATH" ]; then
    echo "❌ Database file not found: $DB_PATH"
    echo "Creating empty database file..."
    touch "$DB_PATH"
    echo "✅ Empty database created. Application will initialize schema on startup."
    exit 0
fi

echo "📊 Database file info:"
ls -la "$DB_PATH"* 2>/dev/null || echo "No database files found"
echo ""

# Backup corrupted files
echo "💾 Backing up database files..."
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_DIR/ccflare.db.corrupted.$TIMESTAMP"
    echo "✅ Backed up main database file"
fi
if [ -f "$DB_PATH-wal" ]; then
    cp "$DB_PATH-wal" "$BACKUP_DIR/ccflare.db-wal.corrupted.$TIMESTAMP"
    echo "✅ Backed up WAL file"
fi
if [ -f "$DB_PATH-shm" ]; then
    cp "$DB_PATH-shm" "$BACKUP_DIR/ccflare.db-shm.corrupted.$TIMESTAMP"
    echo "✅ Backed up SHM file"
fi

# Check database integrity
echo ""
echo "🔍 Checking database integrity..."
if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
    echo "✅ Database integrity check passed - database is not corrupted!"
    echo "The SQLITE_NOTADB error might be due to file locking or permissions."
    echo "Try restarting the pod: kubectl delete pod -l app=ccflare -n coder"
    exit 0
else
    echo "❌ Database integrity check failed - attempting repair..."
fi

# Try WAL recovery first
echo ""
echo "🔧 Attempting WAL recovery..."
if [ -f "$DB_PATH-wal" ] && [ -s "$DB_PATH-wal" ]; then
    echo "WAL file exists and has data, attempting checkpoint..."
    
    if sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(FULL);" 2>/dev/null; then
        echo "✅ WAL checkpoint successful"
        
        # Verify integrity after checkpoint
        if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
            echo "✅ Database repaired successfully via WAL checkpoint!"
            rm -f "$DB_PATH-wal" "$DB_PATH-shm" 2>/dev/null
            echo "🧹 Cleaned up WAL files"
            exit 0
        fi
    else
        echo "❌ WAL checkpoint failed"
    fi
fi

# Try dump and restore
echo ""
echo "🔄 Attempting dump and restore recovery..."
DUMP_FILE="$BACKUP_DIR/recovery_dump.$TIMESTAMP.sql"

if sqlite3 "$DB_PATH" ".dump" > "$DUMP_FILE" 2>/dev/null && [ -s "$DUMP_FILE" ]; then
    echo "✅ Database dump successful"
    
    # Create new database from dump
    rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
    
    if sqlite3 "$DB_PATH" < "$DUMP_FILE" 2>/dev/null; then
        echo "✅ Database restored from dump"
        
        # Verify restored database
        if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" 2>/dev/null | grep -q "ok"; then
            echo "✅ Restored database integrity verified!"
            exit 0
        else
            echo "❌ Restored database failed integrity check"
        fi
    else
        echo "❌ Failed to restore database from dump"
    fi
else
    echo "❌ Failed to dump database"
fi

# Manual intervention required
echo ""
echo "❌ Automatic recovery failed - manual intervention required"
echo ""
echo "🔍 DIAGNOSIS COMPLETE:"
echo "   - Database integrity check failed"
echo "   - WAL checkpoint failed or no WAL file"
echo "   - Dump and restore failed"
echo ""
echo "📋 MANUAL RECOVERY OPTIONS:"
echo ""
echo "1. 🔧 Try advanced SQLite recovery tools:"
echo "   sqlite3 $DB_PATH '.recover' > $BACKUP_DIR/recovered_data.$TIMESTAMP.sql"
echo "   sqlite3 $DB_PATH '.dump' | grep -v '^ROLLBACK' > $BACKUP_DIR/partial_dump.$TIMESTAMP.sql"
echo ""
echo "2. 🔍 Examine database structure:"
echo "   sqlite3 $DB_PATH '.schema'"
echo "   sqlite3 $DB_PATH 'PRAGMA table_info(requests);'"
echo "   sqlite3 $DB_PATH 'SELECT COUNT(*) FROM requests;'"
echo ""
echo "3. 📊 Check file system issues:"
echo "   ls -la $DB_PATH*"
echo "   file $DB_PATH"
echo "   hexdump -C $DB_PATH | head -5"
echo ""
echo "4. 🔄 Try different journal modes:"
echo "   sqlite3 $DB_PATH 'PRAGMA journal_mode=DELETE; VACUUM;'"
echo "   sqlite3 $DB_PATH 'PRAGMA journal_mode=WAL;'"
echo ""
echo "⚠️  DO NOT DELETE DATABASE FILES WITHOUT MANUAL REVIEW"
echo "📁 All backups saved in: $BACKUP_DIR"
echo ""
echo "🆘 If all else fails, contact database administrator"
echo "   Consider restoring from external backups if available"
