import crypto from "node:crypto";
import { BaseRepository } from "./base.repository";

export interface User {
	id: string;
	username: string;
	passwordHash: string;
	createdAt: number;
	lastLogin: number | null;
}

export class UserRepository extends BaseRepository<User> {
	findByUsername(username: string): User | null {
		return this.get<User>(
			"SELECT id, username, password_hash as passwordHash, created_at as createdAt, last_login as lastLogin FROM users WHERE username = ?",
			[username],
		);
	}

	create(username: string, password: string): void {
		const id = crypto.randomUUID();
		const passwordHash = this.hashPassword(password);
		const createdAt = Date.now();

		this.run(
			"INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)",
			[id, username, passwordHash, createdAt],
		);
	}

	updateLastLogin(userId: string): void {
		this.run("UPDATE users SET last_login = ? WHERE id = ?", [
			Date.now(),
			userId,
		]);
	}

	verifyPassword(password: string, passwordHash: string): boolean {
		const hash = this.hashPassword(password);
		return hash === passwordHash;
	}

	private hashPassword(password: string): string {
		// Using SHA-256 for simplicity, but in production you should use bcrypt or argon2
		return crypto.createHash("sha256").update(password).digest("hex");
	}

	// Initialize default user if no users exist
	initializeDefaultUser(): void {
		const userCount = this.get<{ count: number }>(
			"SELECT COUNT(*) as count FROM users",
			[],
		);

		if (userCount && userCount.count === 0) {
			this.create("ccflare_user", "ccflare_password");
		}
	}
}
