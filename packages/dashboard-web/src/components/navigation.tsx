import {
	Activity,
	BarChart3,
	Bot,
	FileText,
	GitBranch,
	LayoutDashboard,
	LogOut,
	Menu,
	Shield,
	Users,
	X,
	Zap,
} from "lucide-react";
import { useState } from "react";
import { useAuth } from "../contexts/auth-context";
import { cn } from "../lib/utils";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Separator } from "./ui/separator";

interface NavItem {
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	value: string;
	badge?: string;
}

const navItems: NavItem[] = [
	{ label: "Overview", icon: LayoutDashboard, value: "overview" },
	{ label: "Analytics", icon: BarChart3, value: "analytics" },
	{ label: "Requests", icon: Activity, value: "requests" },
	{ label: "Accounts", icon: Users, value: "accounts" },
	{ label: "Agents", icon: Bot, value: "agents" },
	{ label: "Logs", icon: FileText, value: "logs" },
];

interface NavigationProps {
	activeTab: string;
	onTabChange: (tab: string) => void;
}

export function Navigation({ activeTab, onTabChange }: NavigationProps) {
	const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
	const { logout } = useAuth();

	return (
		<>
			{/* Mobile header */}
			<div className="lg:hidden fixed top-0 left-0 right-0 z-50 h-16 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b px-4 flex items-center justify-between">
				<div className="flex items-center gap-3">
					<Shield className="h-6 w-6 text-primary" />
					<span className="font-semibold text-lg">ccflare</span>
				</div>
				<div className="flex items-center gap-2">
					<ThemeToggle />
					<Button
						variant="ghost"
						size="sm"
						onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
					>
						{isMobileMenuOpen ? (
							<X className="h-5 w-5" />
						) : (
							<Menu className="h-5 w-5" />
						)}
					</Button>
				</div>
			</div>

			{/* Mobile menu overlay */}
			{isMobileMenuOpen && (
				<button
					type="button"
					className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm cursor-default"
					onClick={() => setIsMobileMenuOpen(false)}
					aria-label="Close menu"
				/>
			)}

			{/* Sidebar */}
			<aside
				className={cn(
					"fixed left-0 top-0 z-40 h-screen w-64 bg-card border-r transition-transform duration-300 lg:translate-x-0",
					isMobileMenuOpen
						? "translate-x-0"
						: "-translate-x-full lg:translate-x-0",
				)}
			>
				<div className="flex h-full flex-col">
					{/* Logo */}
					<div className="p-6 pb-4">
						<div className="flex items-center gap-3">
							<div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
								<Shield className="h-6 w-6 text-primary" />
							</div>
							<div>
								<h1 className="font-semibold text-lg">ccflare</h1>
								<p className="text-xs text-muted-foreground">
									Powerful proxy for Claude Code
								</p>
							</div>
						</div>
					</div>

					<Separator />

					{/* Navigation */}
					<nav className="flex-1 space-y-1 p-4">
						{navItems.map((item) => {
							const Icon = item.icon;
							const isActive = activeTab === item.value;
							return (
								<Button
									key={item.value}
									variant={isActive ? "secondary" : "ghost"}
									className={cn(
										"w-full justify-start gap-3 transition-all",
										isActive &&
											"bg-primary/10 text-primary hover:bg-primary/20",
									)}
									onClick={() => {
										onTabChange(item.value);
										setIsMobileMenuOpen(false);
									}}
								>
									<Icon className="h-4 w-4" />
									{item.label}
									{item.badge && (
										<span className="ml-auto rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium">
											{item.badge}
										</span>
									)}
								</Button>
							);
						})}
					</nav>

					<Separator />

					{/* Footer */}
					<div className="p-4 space-y-4">
						<div className="rounded-lg bg-muted/50 p-3">
							<div className="flex items-center gap-2 text-sm">
								<Zap className="h-4 w-4 text-primary" />
								<span className="font-medium">Status</span>
							</div>
							<p className="mt-1 text-xs text-muted-foreground">
								All systems operational
							</p>
						</div>

						<Button
							variant="ghost"
							className="w-full justify-start gap-3"
							onClick={logout}
						>
							<LogOut className="h-4 w-4" />
							Logout
						</Button>

						<div className="hidden lg:flex items-center justify-between">
							<div className="flex items-center gap-2 text-xs text-muted-foreground">
								<GitBranch className="h-3 w-3" />
								<span>v1.0.0</span>
							</div>
							<ThemeToggle />
						</div>
					</div>
				</div>
			</aside>
		</>
	);
}
