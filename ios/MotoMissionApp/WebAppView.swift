import SwiftUI
import WebKit

struct WebAppView: UIViewRepresentable {
    let rideController: RideActivityController

    func makeCoordinator() -> Coordinator {
        Coordinator(rideController: rideController)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        configuration.mediaTypesRequiringUserActionForPlayback = []
        configuration.userContentController.add(context.coordinator, name: "motoLiveActivity")

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        webView.load(URLRequest(url: AppConfig.webURL))
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}

    static func dismantleUIView(_ webView: WKWebView, coordinator: Coordinator) {
        webView.configuration.userContentController.removeScriptMessageHandler(forName: "motoLiveActivity")
    }

    final class Coordinator: NSObject, WKNavigationDelegate, WKScriptMessageHandler {
        private let rideController: RideActivityController

        init(rideController: RideActivityController) {
            self.rideController = rideController
        }

        func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
            guard message.name == "motoLiveActivity", let body = message.body as? [String: Any] else { return }
            Task { @MainActor in
                rideController.handle(message: body)
            }
        }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
            let script = "window.__MOTO_NATIVE__=true;window.dispatchEvent(new CustomEvent('moto-native-ready'));"
            webView.evaluateJavaScript(script)
        }
    }
}
