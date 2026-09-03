$(function () {
	//route hiden info open close
	$(".route-list__read-more").on("click", function () {
		$(this).closest(".route-list__element").find(".route-list__element-hidden").slideToggle(500);
		$(this).closest(".route-list__element").find(".route-list__element-down-row").toggleClass("hidden-active");
	});

	//burger mob meny open
	$(".burger").on("click", function () {
		$(".header__mobile").toggleClass("header__mobile-active");
		$(this).toggleClass("burger-active");
		var menuIsOpen = $(".header__mobile").hasClass("header__mobile-active");
		var $floatingMenu = $("#floating-menu");
		if ($floatingMenu.length) {
			$floatingMenu.toggleClass("floating-menu-hidden", menuIsOpen);
		}
		// При закрытии бургера сворачиваем открытые подменю (Маршрути/Послуги)
		if (!menuIsOpen) {
			$(".header__mob-nav-ul .menu-item-has-children.active").removeClass("active");
		}
	});
});

document.addEventListener(
	"DOMContentLoaded",
	function () {
		$(".reviews-sec__slider").slick({
			infinite: true,
			speed: 1000,
			adaptiveHeight: true,
			slidesToScroll: 1,
			dots: true,
			slidesToShow: 3,
			prevArrow: '<div class="ar_slier prev-ar_slide"><div class="ar-ic-slider"></div></div>',
			nextArrow: '<div class="ar_slier next-ar_slide"><div class="ar-ic-slider"></div></div>',
			responsive: [
				{
					breakpoint: 1380,
					settings: {
						slidesToShow: 2,
					},
				},
				{
					breakpoint: 985,
					settings: {
						slidesToShow: 1,
						centerMode: true,
						centerPadding: "400px",
					},
				},

				{
					breakpoint: 635,
					settings: {
						slidesToShow: 1,
						centerMode: true,
						centerPadding: "0",
					},
				},
			],
		});

		//popup script

		// <div class="popup-air galery-conteiner" data-air="test">
		// 		<div class="galery-popup">
		// 		</div>
		// 	</div>
		// 	<button class="air-open-btn" data-popup-current="galery">galery</button>
		// 	<button class="air-open-btn" data-popup-current="test">test</button>
		//popup
		function popupAir() {
			const footerElement = document.querySelector("footer");
			if (!footerElement) {
				alert("dont find teg footer");
			} else {
				let airElements = document.querySelectorAll(".popup-air");
				if (airElements.length > 0) {
					let airBtnOpen = document.querySelectorAll(".air-open-btn");
					createAirPopups();

					for (let i = 0; i < airBtnOpen.length; i++) {
						airBtnOpen[i].onclick = openAirPopup;
					}

					document.addEventListener("click", function (event) {
						const dynamicTrigger = event.target.closest(".air-open-btn");
						if (!dynamicTrigger) {
							return;
						}

						const popupTarget = dynamicTrigger.getAttribute("data-popup-current");
						if (!popupTarget) {
							return;
						}

						event.preventDefault();
						openAirPopup.call(dynamicTrigger);
					});
				} else {
					return;
				}

				function createAirPopups() {
					let airConteiner = document.createElement("div");
					airConteiner.classList.add("air-conteiner");

					for (let i = 0; i < airElements.length; i++) {
						let airCloseIcon = document.createElement("div");
						airCloseIcon.classList.add("air-close");
						airElements[i].appendChild(airCloseIcon);
						airConteiner.appendChild(airElements[i]);
					}
					footerElement.after(airConteiner);
				}

				function openAirPopup() {
					let currentAirPopupBtn = this.getAttribute("data-popup-current");
					if (!currentAirPopupBtn) {
						return;
					}
					let allPopups = document.querySelectorAll(".popup-air");
					let currentAirPopup = document.querySelector(`.popup-air[data-air="${currentAirPopupBtn}"]`);
					if (!currentAirPopup) {
						return;
					}
					let closeAirIcon = currentAirPopup.querySelector(".air-close");
					closeAllAirPopups(allPopups);
					openAirConteiner();
					currentAirPopup.classList.add("air-popup_active");

					if (closeAirIcon) {
						closeAirIcon.addEventListener("click", function () {
							currentAirPopup.classList.remove("air-popup_active");
							closeAirConteiner();
						});
					}
				}

				function openAirPopupForForm(curretnDonePopup) {
					let allPopups = document.querySelectorAll(".popup-air");
					let currentAirPopup = document.querySelector(`.popup-air[data-air="${curretnDonePopup}"]`);
					let closeAirIcon = currentAirPopup.querySelector(".air-close");
					closeAllAirPopups(allPopups);
					openAirConteiner();
					currentAirPopup.classList.add("air-popup_active");

					closeAirIcon.addEventListener("click", function () {
						currentAirPopup.classList.remove("air-popup_active");
						closeAirConteiner();
					});
				}

				function openAirConteiner() {
					let airConteier = document.querySelector(".air-conteiner");
					airConteier.classList.add("air-conteiner_active");
				}

				function closeAllAirPopups(allPopups) {
					for (let i = 0; i < allPopups.length; i++) {
						allPopups[i].classList.remove("air-popup_active");
					}
				}
				function closeAirConteiner() {
					let airConteier = document.querySelector(".air-conteiner");
					airConteier.classList.remove("air-conteiner_active");
				}

				function sendFormDone() {
					let allPopups = document.querySelectorAll(".popup-air");
					let curretnDonePopup = "form-send";
					closeAllAirPopups(allPopups);
					openAirPopupForForm(curretnDonePopup);
					setTimeout(function () {
						closeAllAirPopups(allPopups);
						setTimeout(closeAirConteiner, 1000);
					}, 3000);
				}

				//Успешная отправка формы
				const successFormIds = new Set([
					"41",
					"159",
					"210",
					"398",
					"2c99b77",
					"9f2aa29",
					"2c21430",
					"f349de6",
				]);

				const pixelTrackedFormIds = new Set(["398", "9f2aa29"]);

				const getCf7FormId = (event) => {
					if (event && event.detail && event.detail.contactFormId) {
						return String(event.detail.contactFormId).trim();
					}
					const form = event && event.target ? event.target : null;
					if (!form) {
						return "";
					}
					const datasetId = form.getAttribute("data-id") || (form.dataset ? form.dataset.id : "");
					if (datasetId) {
						return String(datasetId).trim();
					}
					const hiddenId = form.querySelector('input[name="_wpcf7"]');
					return hiddenId && hiddenId.value ? String(hiddenId.value).trim() : "";
				};

				document.addEventListener(
					"wpcf7mailsent",
					function (event) {
						const formId = getCf7FormId(event);
						if (formId && successFormIds.has(formId)) {
							sendFormDone();
						}

						if (formId && pixelTrackedFormIds.has(formId) && typeof fbq === "function") {
							fbq("init", "544251448690487");
							fbq("track", "PageView");
						}
					},
					false
				);
			}
		}
		popupAir();
	},
	false
);

window.addEventListener("load", function () {
	const preloader = document.querySelector(".preloader-conteiner");
	if (preloader) {
		preloader.classList.add("hidePreloader");
	}
});

document.addEventListener("DOMContentLoaded", function () {
	jQuery("#phone").inputmask("+38 (999) 999-99-99", { clearIncomplete: true });

	document.addEventListener("click", function (event) {
		if (event.target.classList.contains("air-close")) {
			let popup = event.target.closest(".popup-air.main-form");
			let popupContainer = event.target.closest(".air-conteiner");
			if (popup.classList.contains("air-popup_active")) {
				popup.classList.remove("air-popup_active");
				popupContainer.classList.remove("air-conteiner_active");
			}
		}
		if (event.target.classList.contains("search__input-btn")) {
			event.preventDefault(); // Предотвращаем стандартное поведение кнопки

			let form = event.target.closest("form"); // Находим ближайшую форму
			if (!form) return;

			let isValid = validateForm(form);
			if (!isValid) return; // Если валидация не пройдена, не отправляем

			let formData = new FormData(form);

			fetch(form.getAttribute("action"), {
				method: "POST",
				body: formData,
			})
				.then((response) => response.json()) // Ожидаем JSON
				.then((data) => {
					if (data.success) {
						alert("Заявка успешно отправлена!");
						form.reset();
					} else {
						alert("Ошибка при отправке: " + (data.message || "Неизвестная ошибка"));
					}
				})
				.catch((error) => {
					console.error("Ошибка:", error);
				});
		}
	});

	function validateForm(form) {
		let isValid = true;

		let fullnameInput = form.querySelector("#fullname");
		let fullnameError = form.querySelector("#fullname-error");
		if (fullnameInput && fullnameError) {
			const words = fullnameInput.value.trim().split(/\s+/);
			if (words.length !== 3 || words.some((word) => word === "")) {
				fullnameError.style.display = "block";
				isValid = false;
			} else {
				fullnameError.style.display = "none";
			}
		}

		let phoneInput = form.querySelector("#phone");
		let phoneError = form.querySelector("#phone-error");
		if (phoneInput && phoneError) {
			if (phoneInput.value.trim().length !== 19) {
				// Длина маски
				phoneError.style.display = "block";
				isValid = false;
			} else {
				phoneError.style.display = "none";
			}
		}

		return isValid;
	}
});

document.addEventListener("DOMContentLoaded", function () {
	var deliverySections = document.querySelectorAll(".delivery-price-sec");
	if (!deliverySections.length) {
		return;
	}

	Array.prototype.forEach.call(deliverySections, function (section) {
		var subtitleEl = section.querySelector(".delivery-price-sec__calc-subtitle");
		var triggers = section.querySelectorAll(".js-delivery-price-trigger");

		if (!subtitleEl || !triggers.length) {
			return;
		}

		var defaultSubtitle = subtitleEl.textContent.trim();
		if (!defaultSubtitle) {
			defaultSubtitle = subtitleEl.textContent || "";
		}

		function clearActiveState() {
			Array.prototype.forEach.call(triggers, function (trigger) {
				trigger.classList.remove("is-active");
			});
		}

		function updateSubtitle(trigger) {
			if (!trigger) {
				subtitleEl.textContent = defaultSubtitle;
				return;
			}

			var price = trigger.getAttribute("data-package-price") || "";
			var label = trigger.getAttribute("data-package-label") || "";
			if (price && label) {
				subtitleEl.textContent = label + ": " + price;
			} else if (price) {
				subtitleEl.textContent = price;
			} else if (label) {
				subtitleEl.textContent = label;
			} else {
				subtitleEl.textContent = defaultSubtitle;
			}
		}

		function handleTriggerClick(event) {
			var currentTrigger = event.currentTarget;
			clearActiveState();
			currentTrigger.classList.add("is-active");
			updateSubtitle(currentTrigger);
		}

		Array.prototype.forEach.call(triggers, function (trigger) {
			trigger.addEventListener("click", handleTriggerClick);
		});

		var firstTriggerWithPrice = null;
		Array.prototype.forEach.call(triggers, function (trigger) {
			if (!firstTriggerWithPrice && trigger.getAttribute("data-package-price")) {
				firstTriggerWithPrice = trigger;
			}
		});

		if (!firstTriggerWithPrice) {
			firstTriggerWithPrice = triggers[0];
		}

		if (firstTriggerWithPrice) {
			firstTriggerWithPrice.classList.add("is-active");
			updateSubtitle(firstTriggerWithPrice);
		} else {
			updateSubtitle(null);
		}
	});
});
