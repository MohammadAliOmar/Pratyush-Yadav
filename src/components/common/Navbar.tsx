import React, { useState, useEffect, useRef } from 'react';
import { User } from '../../types';
import {
  Compass,
  Home,
  PlusCircle,
  FileText,
  User as UserIcon,
  LayoutDashboard,
  GitCompare,
  Search,
  AlertTriangle,
  Archive,
  History,
  FlaskConical,
  LogOut,
  Menu,
  X,
  Bell,
  ChevronDown,
} from 'lucide-react';

interface NavbarProps {
  currentUser: User | null;
  activeScreen: string;
  onNavigate: (screen: string) => void;
  unreadNotifsCount?: number;
  onSignOut: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  activeScreen,
  onNavigate,
  unreadNotifsCount = 0,
  onSignOut,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'manage' | 'user' | null>(null);

  const navRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside or Escape
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenDropdown(null);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const toggleDropdown = (name: 'manage' | 'user') => {
    setOpenDropdown((prev) => (prev === name ? null : name));
  };

  const closeAll = () => {
    setOpenDropdown(null);
    setMobileMenuOpen(false);
  };

  const isAdmin = currentUser?.role === 'admin';

  const studentNavItems = [
    { id: 'student_home', label: 'Home', icon: Home },
    { id: 'student_report', label: 'Report Item', icon: PlusCircle },
    { id: 'student_my_reports', label: 'My Reports', icon: FileText },
    { id: 'student_profile', label: 'Profile', icon: UserIcon },
  ];

  const adminManageItems = [
    { id: 'admin_dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'admin_queue', label: 'Match Review Queue', icon: GitCompare, activeAlso: 'admin_verification' },
    { id: 'admin_search', label: 'Search & Filter', icon: Search },
    { id: 'admin_flagged', label: 'Flagged Accounts', icon: AlertTriangle },
    { id: 'admin_archive', label: 'Archive', icon: Archive },
    { id: 'admin_audit', label: 'Audit Log', icon: History },
  ];

  // Helper for initials
  const getInitials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  };

  const isManageActive = ['admin_search', 'admin_flagged', 'admin_archive'].includes(activeScreen);

  return (
    <header className="sticky top-0 z-40 h-16 bg-white/90 backdrop-blur-md border-b border-slate-200">
      <div ref={navRef} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-full">
        <div className="flex items-center justify-between h-full whitespace-nowrap">
          {/* Left: Logo & Branding + Primary Nav Links */}
          <div className="flex items-center gap-6">
            <button
              onClick={() => {
                closeAll();
                onNavigate(isAdmin ? 'admin_dashboard' : 'student_home');
              }}
              className="flex items-center gap-2.5 text-left group cursor-pointer focus-visible:outline-none"
            >
              <div className="w-9 h-9 rounded-lg bg-blue-700 text-white flex items-center justify-center font-bold shadow-xs group-hover:bg-blue-800 transition-colors">
                <Compass className="w-5 h-5" />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-2">
                  <span className="font-serif font-semibold text-slate-900 tracking-tight text-lg">
                    CampusFind
                  </span>
                  {isAdmin && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                      Admin
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-normal">
                  Victoria University, Sydney
                </p>
              </div>
            </button>

            {/* Desktop Navigation Links */}
            <nav className="hidden lg:flex items-center gap-1">
              {currentUser && !isAdmin &&
                studentNavItems
                  .filter((item) => item.id !== 'student_profile')
                  .map((item) => {
                    const Icon = item.icon;
                    const isActive = activeScreen === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          closeAll();
                          onNavigate(item.id);
                        }}
                        className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}

              {currentUser && isAdmin && (
                <>
                  <button
                    onClick={() => {
                      closeAll();
                      onNavigate('admin_dashboard');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      activeScreen === 'admin_dashboard'
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <LayoutDashboard className="w-4 h-4 shrink-0" />
                    <span>Dashboard</span>
                  </button>

                  <button
                    onClick={() => {
                      closeAll();
                      onNavigate('admin_queue');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      activeScreen === 'admin_queue' || activeScreen === 'admin_verification'
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <GitCompare className="w-4 h-4 shrink-0" />
                    <span>Match Review Queue</span>
                  </button>

                  {/* Manage Dropdown for other Admin screens */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => toggleDropdown('manage')}
                      aria-haspopup="true"
                      aria-expanded={openDropdown === 'manage'}
                      className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                        isManageActive && activeScreen !== 'admin_dashboard' && activeScreen !== 'admin_queue' && activeScreen !== 'admin_verification'
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <span>Manage</span>
                      <ChevronDown className={`w-3.5 h-3.5 transition-transform ${openDropdown === 'manage' ? 'rotate-180' : ''}`} />
                    </button>

                    {openDropdown === 'manage' && (
                      <div
                        role="menu"
                        className="absolute left-0 mt-2 w-56 bg-white border border-slate-200 rounded-xl shadow-md py-1.5 z-50 text-xs"
                      >
                        {adminManageItems
                          .filter(
                            (item) =>
                              item.id !== 'admin_dashboard' &&
                              item.id !== 'admin_queue' &&
                              item.id !== 'admin_audit'
                          )
                          .map((item) => {
                            const Icon = item.icon;
                            const isActive = activeScreen === item.id || (item.activeAlso && activeScreen === item.activeAlso);
                            return (
                              <button
                                key={item.id}
                                role="menuitem"
                                onClick={() => {
                                  closeAll();
                                  onNavigate(item.id);
                                }}
                                className={`w-full text-left px-3.5 py-2 flex items-center gap-2.5 transition-colors cursor-pointer ${
                                  isActive ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <Icon className="w-4 h-4 text-slate-500" />
                                <span>{item.label}</span>
                              </button>
                            );
                          })}
                      </div>
                    )}
                  </div>

                  <button
                    onClick={() => {
                      closeAll();
                      onNavigate('admin_audit');
                    }}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                      activeScreen === 'admin_audit'
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <History className="w-4 h-4 shrink-0" />
                    <span>Audit Log</span>
                  </button>
                </>
              )}
            </nav>
          </div>

          {/* Right: Admin Notification Bell & User Menu / Sign In */}
          <div className="flex items-center gap-2">
            {/* Admin Notifications Bell (Admins only) */}
            {isAdmin && (
              <button
                onClick={() => {
                  closeAll();
                  onNavigate('admin_dashboard');
                }}
                className="relative p-2 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 cursor-pointer"
                title={`${unreadNotifsCount} Admin notifications`}
                aria-label={`${unreadNotifsCount} Admin notifications`}
              >
                <Bell className="w-4 h-4 text-slate-700" />
                {unreadNotifsCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-rose-600 text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadNotifsCount}
                  </span>
                )}
              </button>
            )}

            {/* User Menu Dropdown (Signed In) / Sign In Button (Signed Out) */}
            {currentUser ? (
              <div className="relative">
                {/* User Menu Trigger Button */}
                <button
                  type="button"
                  onClick={() => toggleDropdown('user')}
                  aria-haspopup="true"
                  aria-expanded={openDropdown === 'user'}
                  title={currentUser.name}
                  aria-label={`User menu for ${currentUser.name}`}
                  className="flex items-center gap-2 p-1.5 sm:px-2.5 sm:py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
                >
                  <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold tracking-tight">
                    {getInitials(currentUser.name)}
                  </div>
                  <div className="hidden sm:block text-left leading-tight pr-0.5">
                    <div className="text-xs font-semibold text-slate-900">
                      {currentUser.name}
                    </div>
                    <div className="text-[10px] text-slate-500 capitalize">
                      {currentUser.role}
                    </div>
                  </div>
                  <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${openDropdown === 'user' ? 'rotate-180' : ''}`} />
                </button>

                {/* User Dropdown Menu */}
                <div
                  role="menu"
                  className={`absolute right-0 mt-2 w-60 bg-white border border-slate-200 rounded-xl shadow-md py-1.5 z-50 text-xs ${
                    openDropdown === 'user' ? 'block' : 'hidden'
                  }`}
                >
                  {/* User info at the top */}
                  <div className="px-3.5 py-2.5 border-b border-slate-100">
                    <div className="font-bold text-slate-900 truncate">{currentUser.name}</div>
                    <div className="text-[11px] text-slate-500 truncate">{currentUser.email}</div>
                    <div className="mt-1">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 capitalize">
                        {currentUser.role}
                      </span>
                    </div>
                  </div>

                  {/* Profile (Students and Staff only) */}
                  {currentUser.role !== 'admin' && (
                    <button
                      role="menuitem"
                      onClick={() => {
                        closeAll();
                        onNavigate('student_profile');
                      }}
                      className={`w-full text-left px-3.5 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                        activeScreen === 'student_profile' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <UserIcon className="w-4 h-4 text-slate-500" />
                      <span>Profile</span>
                    </button>
                  )}

                  {/* Algorithm Tests (Admins only, at the bottom above Sign Out, separated by a divider) */}
                  {currentUser.role === 'admin' && (
                    <div className="border-t border-slate-100 my-1 pt-1">
                      <button
                        role="menuitem"
                        onClick={() => {
                          closeAll();
                          onNavigate('system_tests');
                        }}
                        className={`w-full text-left px-3.5 py-2 flex items-center gap-2 transition-colors cursor-pointer ${
                          activeScreen === 'system_tests' ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <FlaskConical className="w-4 h-4 text-blue-600" />
                        <span>Algorithm Tests</span>
                      </button>
                    </div>
                  )}

                  {/* Sign Out */}
                  <button
                    role="menuitem"
                    aria-label="Sign Out"
                    title="Sign Out"
                    onClick={() => {
                      closeAll();
                      onSignOut();
                    }}
                    className="w-full text-left px-3.5 py-2 flex items-center gap-2 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer font-medium border-t border-slate-100"
                  >
                    <LogOut className="w-4 h-4 text-rose-500" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            ) : activeScreen !== 'signin' ? (
              <button
                onClick={() => {
                  closeAll();
                  onNavigate('signin');
                }}
                className="px-3.5 py-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-xs cursor-pointer transition-colors"
              >
                Sign In
              </button>
            ) : (
              <span className="sr-only">Sign In</span>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 rounded-lg text-slate-600 hover:bg-slate-100 cursor-pointer"
              aria-label="Toggle navigation menu"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Dropdown Panel: Sections Navigate & Account */}
        {mobileMenuOpen && (
          <div className="lg:hidden mt-2 p-3 bg-white border border-slate-200 rounded-xl shadow-md space-y-4">
            {/* Section 1: Navigate */}
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
                Navigate
              </div>
              <div className="space-y-0.5">
                {currentUser && !isAdmin &&
                  studentNavItems
                    .filter((item) => item.id !== 'student_profile')
                    .map((item) => {
                      const Icon = item.icon;
                      const isActive = activeScreen === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => {
                            onNavigate(item.id);
                            setMobileMenuOpen(false);
                          }}
                          className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                            isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <Icon className="w-4 h-4" /> {item.label}
                        </button>
                      );
                    })}

                {currentUser && isAdmin &&
                  adminManageItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeScreen === item.id || (item.activeAlso && activeScreen === item.activeAlso);
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          onNavigate(item.id);
                          setMobileMenuOpen(false);
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors cursor-pointer ${
                          isActive ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-4 h-4" /> {item.label}
                      </button>
                    );
                  })}

                {!currentUser && activeScreen !== 'signin' && (
                  <button
                    onClick={() => {
                      onNavigate('signin');
                      setMobileMenuOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 text-blue-700 hover:bg-blue-50 cursor-pointer"
                  >
                    <UserIcon className="w-4 h-4" /> Sign In
                  </button>
                )}
              </div>
            </div>

            {/* Section 2: Account */}
            <div className="pt-2 border-t border-slate-100">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
                Account
              </div>
              {currentUser ? (
                <div className="space-y-1 px-3 py-1">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900">{currentUser.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {currentUser.email} (<span className="capitalize">{currentUser.role}</span>)
                      </div>
                    </div>
                  </div>
                  {currentUser.role !== 'admin' && (
                    <button
                      onClick={() => {
                        onNavigate('student_profile');
                        setMobileMenuOpen(false);
                      }}
                      className="w-full mt-2 text-left py-1.5 text-xs text-blue-700 font-medium flex items-center gap-1.5 cursor-pointer"
                    >
                      <UserIcon className="w-3.5 h-3.5" /> Profile
                    </button>
                  )}
                  {currentUser.role === 'admin' && (
                    <button
                      onClick={() => {
                        onNavigate('system_tests');
                        setMobileMenuOpen(false);
                      }}
                      className={`w-full mt-2 text-left py-1.5 text-xs font-medium flex items-center gap-1.5 cursor-pointer ${
                        activeScreen === 'system_tests' ? 'text-blue-700 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      <FlaskConical className="w-3.5 h-3.5 text-blue-600" /> Algorithm Tests
                    </button>
                  )}
                  <button
                    onClick={() => {
                      onSignOut();
                      setMobileMenuOpen(false);
                    }}
                    aria-label="Sign Out"
                    title="Sign Out"
                    className="w-full mt-2 text-left py-1.5 text-xs text-rose-600 font-semibold flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5" /> Sign Out
                  </button>
                </div>
              ) : (
                <div className="px-3 py-1 text-xs text-slate-500">
                  Not signed in.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
