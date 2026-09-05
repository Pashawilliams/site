(function () {
    'use strict';

    function getPreferredDepartureTime(times) {
        if (!Array.isArray(times) || !times.length) {
            return '08:00';
        }
        const now = new Date();
        const currentMinutes = now.getHours() * 60 + now.getMinutes();
        for (const time of times) {
            const parts = (time || '').split(':');
            if (parts.length < 2) {
                continue;
            }
            const hours = Number(parts[0]);
            const minutes = Number(parts[1]);
            if (Number.isNaN(hours) || Number.isNaN(minutes)) {
                continue;
            }
            const totalMinutes = hours * 60 + minutes;
            if (totalMinutes >= currentMinutes) {
                return time;
            }
        }
        return times[0];
    }

    function resolveDateHintText(node) {
        // У формі бронювання завжди підставляємо завтра
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow.toLocaleDateString('uk-UA');
    }

    function getSelectedOptionText(selectId) {
        const select = document.getElementById(selectId);
        if (!select || !select.value) {
            return '';
        }
        const option = select.options[select.selectedIndex];
        return option ? option.text.trim() : '';
    }

    function parseDepartureTimes(timesSource) {
        try {
            const parsed = JSON.parse(timesSource || '[]');
            return Array.isArray(parsed) ? parsed : [];
        } catch (err) {
            return [];
        }
    }

    function stripDatePrefix(value) {
        if (!value) {
            return '';
        }
        return value.replace(/^Дата:\s*/i, '').trim();
    }

    function extractPassengersFromCard(card) {
        const priceEl = card.querySelector('.direction-element__price');
        if (!priceEl) {
            return '';
        }
        const text = priceEl.textContent || '';
        const match = text.match(/Пасажири:\s*(.+)$/i);
        return match ? match[1].trim() : '';
    }

    function extractCardContext(card) {
        const cardFromName = card.getAttribute('data-from-name') || '';
        const cardToName = card.getAttribute('data-to-name') || '';
        const priceEl = card.querySelector('.direction-element__price');
        const price = priceEl ? priceEl.textContent.trim() : '';

        const effectiveFromName = getSelectedOptionText('search-from') || cardFromName;
        const effectiveToName = getSelectedOptionText('search-to') || cardToName;

        const directionText = effectiveFromName && effectiveToName
            ? ''.concat(effectiveFromName, ' - ', effectiveToName)
            : (card.querySelector('.direction-location-element__city')?.textContent.trim() || '');

        const dateHintEl = card.querySelector('.direction-element__date-hint');
        const dateValue = resolveDateHintText(dateHintEl);
        const rawDateHint = card.getAttribute('data-date-hint') || (dateHintEl ? dateHintEl.textContent.trim() : '');

        const passengers = (card.getAttribute('data-passengers') || '').trim() || extractPassengersFromCard(card);
        const departureTimes = parseDepartureTimes(card.getAttribute('data-departure-times'));
        const bookingTime = getPreferredDepartureTime(departureTimes);

        return {
            directionText: directionText,
            price: price,
            effectiveFromName: effectiveFromName,
            effectiveToName: effectiveToName,
            dateValue: dateValue,
            rawDateHint: rawDateHint,
            bookingTime: bookingTime,
            passengers: passengers
        };
    }

    function populateBookingForm(cardContext) {
        const form = document.querySelector('.booking-form form');
        if (!form) {
            return;
        }

        const directionInput = form.querySelector('.booking-form__direction') || form.querySelector('[name*="direction"]');
        const directionVisibleInput = form.querySelector('.booking-form__direction-visible') || form.querySelector('[name*="direction-visible"]');
        const priceInput = form.querySelector('.booking-form__price') || form.querySelector('[name*="price"]');
        const startInput = form.querySelector('.booking-form__start-point') || form.querySelector('[name*="start-point"]');
        const endInput = form.querySelector('.booking-form__end-point') || form.querySelector('[name*="end-point"]');
        const dateFormInput = form.querySelector('.booking-form__date') || form.querySelector('[name*="date"]');
        const timeInput = form.querySelector('.booking-form__time') || form.querySelector('[name*="time"]');

        if (directionInput) directionInput.value = cardContext.directionText;
        if (directionVisibleInput) directionVisibleInput.value = cardContext.directionText;
        if (priceInput) priceInput.value = cardContext.price;
        if (startInput) startInput.value = cardContext.effectiveFromName;
        if (endInput) endInput.value = cardContext.effectiveToName;
        if (dateFormInput) dateFormInput.value = cardContext.dateValue;
        if (timeInput) timeInput.value = cardContext.bookingTime;
    }

    function populateTransferForm(cardContext) {
        const form = document.querySelector('.transfer-form');
        if (!form) {
            return;
        }

        const fromInput = form.querySelector('.transfer-form__inp-from input');
        const toInput = form.querySelector('.transfer-form__inp-to input');
        const dateInput = form.querySelector('.transfer-form__date input');
        const passengersInput = form.querySelector('.transfer-form__pasanger input');

        if (fromInput) fromInput.value = cardContext.effectiveFromName || '';
        if (toInput) toInput.value = cardContext.effectiveToName || '';

        const normalizedDate = stripDatePrefix(cardContext.rawDateHint) || stripDatePrefix(cardContext.dateValue) || cardContext.dateValue;
        if (dateInput) dateInput.value = normalizedDate;
        if (passengersInput) passengersInput.value = cardContext.passengers || '';
    }

    document.addEventListener('DOMContentLoaded', function () {
        document.addEventListener('click', function (event) {
            const trigger = event.target.closest('.air-open-btn');
            if (!trigger) {
                return;
            }

            const popupTarget = trigger.getAttribute('data-popup-current');
            if (popupTarget !== 'booking-form-popup' && popupTarget !== 'transfer-form') {
                return;
            }

            const card = trigger.closest('.direction-element');
            if (!card) {
                return;
            }

            const cardContext = extractCardContext(card);

            if (popupTarget === 'booking-form-popup') {
                populateBookingForm(cardContext);
            }

            if (popupTarget === 'transfer-form') {
                populateTransferForm(cardContext);
            }
        });
    });
})();
