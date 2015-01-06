//
//  ViewController.swift
//  SCL File Picker
//
//  Created by Blake Barrett on 10/28/14.
//  Copyright (c) 2014 Socialcast Inc.,. All rights reserved.
//

import UIKit

class ViewController: UIViewController, UIWebViewDelegate {

    var webView: UIWebView!
    
    required init(coder aDecoder: NSCoder)  {
        super.init(coder: aDecoder);
    }
    
    override func viewDidLoad() {
        super.viewDidLoad()
        loadBrowserView()
    }

    override func didReceiveMemoryWarning() {
        super.didReceiveMemoryWarning()
    }

    override func prefersStatusBarHidden() -> Bool {
        return true
    }

    func loadBrowserView() {
        
        webView = UIWebView(frame: self.view.bounds)
        webView.delegate = self
        
//        let fileString = NSBundle.mainBundle().pathForResource("index", ofType: "html")
//        let url: NSURL = NSURL(fileURLWithPath: fileString!)!
        let url: NSURL = NSURL(string: "https://dev5.airwatchdev.com/MyDevice/ContentPicker")!
        let request: NSMutableURLRequest = NSMutableURLRequest(URL: url)
        
        webView.loadRequest(request)
        webView.hidden = false
        
        self.view.addSubview(webView)
    }


    func webView(webView: UIWebView, shouldStartLoadWithRequest request: NSURLRequest, navigationType: UIWebViewNavigationType) -> Bool {
        NSLog("webView request URL: %@", request.URL);
        if (isSelectedFile(request.URL)) {
            var query: String = request.URL.query!
            println(query)
            return false
        }
        // conditionally switch based on request.URL
        return true
    }
    
    func isSelectedFile(url: NSURL) -> Bool {
        var sclScheme = "scl-file-selected"
        return url.scheme!.hasPrefix(sclScheme)
    }
    
}

