#!/bin/bash
# Emergency database corruption fix script for Kubernetes pods

set -e

# Detect environment (pod vs traditional)
if [ -f /.dockerenv ] || [ -n "$KUBERNETES_SERVICE_HOST" ]; then
    echo "🐳 Detected containerized environment"
    DB_PATH="${1:-/app/data/ccflare.db}"
    BACKUP_DIR="/app/data/backups"
    IS_CONTAINER=true
else
    echo "🖥️  Detected traditional environment"
    DB_PATH="${1:-/opt/ccflare/data/ccflare.db}"
    BACKUP_DIR="/opt/ccflare/data/backups"
    IS_CONTAINER=false
fi

TIMESTAMP=$(date +%Y%m%d_%H%M%S)

echo "🚨 Emergency Database Corruption Fix"
echo "Database path: $DB_PATH"
echo "Backup directory: $BACKUP_DIR"
echo "Timestamp: $TIMESTAMP"
echo "Container mode: $IS_CONTAINER"

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Stop the service (different methods for container vs traditional)
if [ "$IS_CONTAINER" = "true" ]; then
    echo "📛 Container mode: Cannot stop service, manual intervention required"
    echo "   Please scale down the deployment or kill the main process"
    echo "   kubectl scale deployment ccflare --replicas=0 -n coder"
    echo "   Then run this script and scale back up"
else
    echo "📛 Stopping ccflare service..."
    systemctl stop ccflare || echo "Service not running or not systemd"
fi

# Backup corrupted files
echo "💾 Backing up corrupted database files..."
if [ -f "$DB_PATH" ]; then
    cp "$DB_PATH" "$BACKUP_DIR/ccflare.db.corrupted.$TIMESTAMP"
fi
if [ -f "$DB_PATH-wal" ]; then
    cp "$DB_PATH-wal" "$BACKUP_DIR/ccflare.db-wal.corrupted.$TIMESTAMP"
fi
if [ -f "$DB_PATH-shm" ]; then
    cp "$DB_PATH-shm" "$BACKUP_DIR/ccflare.db-shm.corrupted.$TIMESTAMP"
fi

# Try to recover using WAL file
echo "🔧 Attempting WAL recovery..."
if [ -f "$DB_PATH-wal" ] && [ -s "$DB_PATH-wal" ]; then
    echo "WAL file exists and has data, attempting recovery..."
    
    # Try to checkpoint the WAL file
    sqlite3 "$DB_PATH" "PRAGMA wal_checkpoint(FULL);" 2>/dev/null || {
        echo "❌ WAL checkpoint failed, database is severely corrupted"
        
        # Try to dump and restore from WAL
        echo "🔄 Attempting dump/restore recovery..."
        sqlite3 "$DB_PATH" ".dump" > "$BACKUP_DIR/recovery_dump.$TIMESTAMP.sql" 2>/dev/null || {
            echo "❌ Cannot dump database, creating fresh database"
            
            # Remove corrupted files
            rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
            
            # Create fresh database (will be initialized by application)
            echo "🆕 Creating fresh database (data will be lost)"
            touch "$DB_PATH"
        }
        
        if [ -f "$BACKUP_DIR/recovery_dump.$TIMESTAMP.sql" ] && [ -s "$BACKUP_DIR/recovery_dump.$TIMESTAMP.sql" ]; then
            echo "✅ Dump successful, restoring database..."
            rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
            sqlite3 "$DB_PATH" < "$BACKUP_DIR/recovery_dump.$TIMESTAMP.sql"
            echo "✅ Database restored from dump"
        fi
    }
else
    echo "❌ No WAL file or empty WAL file, cannot recover"
    rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
    echo "🆕 Creating fresh database (data will be lost)"
    touch "$DB_PATH"
fi

# Verify database integrity
echo "🔍 Verifying database integrity..."
if sqlite3 "$DB_PATH" "PRAGMA integrity_check;" | grep -q "ok"; then
    echo "✅ Database integrity check passed"
else
    echo "❌ Database integrity check failed, recreating..."
    rm -f "$DB_PATH" "$DB_PATH-wal" "$DB_PATH-shm"
    touch "$DB_PATH"
fi

# Set proper permissions
if [ "$IS_CONTAINER" = "true" ]; then
    # In container, we're already running as ccflare user
    chmod 664 "$DB_PATH" 2>/dev/null || echo "Could not set permissions"
else
    chown ccflare:ccflare "$DB_PATH" 2>/dev/null || echo "Could not set ownership"
    chmod 664 "$DB_PATH" 2>/dev/null || echo "Could not set permissions"
fi

# Start the service (different methods for container vs traditional)
if [ "$IS_CONTAINER" = "true" ]; then
    echo "🔄 Container mode: Manual restart required"
    echo "   Scale the deployment back up:"
    echo "   kubectl scale deployment ccflare --replicas=1 -n coder"
    echo "   Or restart the pod:"
    echo "   kubectl delete pod -l app=ccflare -n coder"
else
    echo "🔄 Starting ccflare service..."
    systemctl start ccflare || echo "Could not start service via systemctl"
fi

echo "✅ Database corruption fix completed"
echo "📁 Backup files saved in: $BACKUP_DIR"

if [ "$IS_CONTAINER" = "true" ]; then
    echo "📊 Check pod status: kubectl get pods -l app=ccflare -n coder"
    echo "� Check logs: kubectl logs -l app=ccflare -n coder -f"
else
    echo "�📊 Check service status: systemctl status ccflare"
    echo "📋 Check logs: journalctl -u ccflare -f"
fi
