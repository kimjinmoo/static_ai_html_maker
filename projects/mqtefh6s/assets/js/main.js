
        document.addEventListener('DOMContentLoaded', function() {
            // Intersection Observer for Fade-In Animation (Implementing Staggering)
            const faders = document.querySelectorAll('.fade-in-element');

            const observerOptions = {
                root: null,
                rootMargin: '0px',
                threshold: 0.1 
            };

            const observer = new IntersectionObserver((entries, observer) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        const element = entry.target;
                        const delay = parseFloat(element.dataset.delay) || 0;
                        
                        // Apply a timeout based on data-delay for staggered effect
                        setTimeout(() => {
                            element.classList.add('visible');
                        }, delay * 1000); 

                        observer.unobserve(element); // Stop observing once visible
                    }
                });
            }, observerOptions);

            faders.forEach(el => {
                observer.observe(el);
            });
        });
    