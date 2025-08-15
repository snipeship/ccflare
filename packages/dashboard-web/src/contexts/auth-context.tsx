import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useState,
} from "react";

interface AuthContextType {
	isAuthenticated: boolean;
	login: (username: string, password: string) => Promise<boolean>;
	logout: () => void;
	authEnabled: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [isAuthenticated, setIsAuthenticated] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [authEnabled, setAuthEnabled] = useState(true);

	// Check if already authenticated on mount
	useEffect(() => {
		const checkAuth = async () => {
			try {
				const response = await fetch("/api/auth/check", {
					credentials: "include",
				});
				
				const data = await response.json();
				setIsAuthenticated(data.authenticated);
				
				// Check if auth is enabled by looking for authEnabled field in response
				// If not present, assume auth is enabled for backward compatibility
				setAuthEnabled(data.authEnabled !== false);
			} catch {
				setIsAuthenticated(false);
				setAuthEnabled(true); // Assume auth is enabled on error
			} finally {
				setIsLoading(false);
			}
		};

		checkAuth();
	}, []);

	const login = async (
		username: string,
		password: string,
	): Promise<boolean> => {
		try {
			const response = await fetch("/api/auth/login", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({ username, password }),
				credentials: "include",
			});

			if (response.ok) {
				setIsAuthenticated(true);
				return true;
			}
			return false;
		} catch {
			return false;
		}
	};

	const logout = async () => {
		try {
			await fetch("/api/auth/logout", {
				method: "POST",
				credentials: "include",
			});
		} catch {
			// Ignore errors
		}
		setIsAuthenticated(false);
	};

	if (isLoading) {
		return <div className="min-h-screen bg-background" />;
	}

	return (
		<AuthContext.Provider value={{ isAuthenticated, login, logout, authEnabled }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	const context = useContext(AuthContext);
	if (context === undefined) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return context;
}
