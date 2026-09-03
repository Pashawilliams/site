/**
 * Navigation Submenu Toggle for Mobile
 * Handles click events to expand/collapse submenus on mobile devices
 */

(function() {
    'use strict';
    
    // Wait for DOM to be ready
    document.addEventListener('DOMContentLoaded', function() {
        
        // Add scroll detection for header styling
        const header = document.querySelector('.header');
        if (header) {
            window.addEventListener('scroll', function() {
                if (window.scrollY > 50) {
                    header.classList.add('scrolled');
                } else {
                    header.classList.remove('scrolled');
                }
            });
        }
        
        // Get all menu items with children in mobile menu
        const mobileMenuItems = document.querySelectorAll('.header__mob-nav-ul .menu-item-has-children');
        
        if (mobileMenuItems.length > 0) {
            // Add click handler to each parent menu item
            mobileMenuItems.forEach(function(menuItem) {
                const link = menuItem.querySelector('a');
                
                if (!link) {
                    return;
                }
                
                // Create a toggle button or use the link itself
                link.addEventListener('click', function(e) {
                    // Check if we're on mobile (screen width < 985px)
                    if (window.innerWidth <= 985) {
                        // Prevent default link behavior on mobile
                        e.preventDefault();
                        e.stopPropagation();
                        
                        var willOpen = !menuItem.classList.contains('active');

                        // Close other open submenus (accordion)
                        const siblings = Array.from(menuItem.parentElement.children);
                        siblings.forEach(function(sibling) {
                            if (sibling !== menuItem && sibling.classList.contains('menu-item-has-children')) {
                                sibling.classList.remove('active');
                            }
                        });

                        menuItem.classList.toggle('active', willOpen);

                        // Снимаем фокус, чтобы :focus-within не держал меню открытым
                        if (document.activeElement && typeof document.activeElement.blur === 'function') {
                            document.activeElement.blur();
                        }

                        // Если открыли длинный список — прокрутить к пункту
                        if (willOpen) {
                            setTimeout(function() {
                                try {
                                    menuItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                                } catch (err) {}
                            }, 50);
                        }
                    }
                    // On desktop, allow normal link behavior
                });
            });
        }
        
        // Also handle desktop menu items for better accessibility
        const desktopMenuItems = document.querySelectorAll('.header__nav-list > .menu-item-has-children');
        
        if (desktopMenuItems.length > 0) {
            desktopMenuItems.forEach(function(menuItem) {
                const link = menuItem.querySelector('a');
                
                if (!link) {
                    return;
                }
                
                // Add keyboard support (Enter/Space to toggle)
                link.addEventListener('keydown', function(e) {
                    if (e.key === 'Enter' || e.key === ' ') {
                        // On desktop, toggle focus-within for keyboard navigation
                        if (window.innerWidth > 985) {
                            e.preventDefault();
                            menuItem.classList.toggle('focus-within');
                        }
                    }
                });
                
                // Remove focus-within class when clicking outside
                document.addEventListener('click', function(e) {
                    if (!menuItem.contains(e.target)) {
                        menuItem.classList.remove('focus-within');
                    }
                });
            });
        }
        
        // Handle window resize to reset mobile menu states
        let resizeTimer;
        window.addEventListener('resize', function() {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(function() {
                // Remove active class from all items when switching to desktop
                if (window.innerWidth > 985) {
                    document.querySelectorAll('.menu-item-has-children.active').forEach(function(item) {
                        item.classList.remove('active');
                    });
                }
            }, 250);
        });
        
    });
    
})();
